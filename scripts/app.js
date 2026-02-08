let state = {
    data: null, // Initialized as null to check if we need to fetch
    cat: localStorage.getItem('lastCat') || "A",
    view: localStorage.getItem('lastView') || "schedule",
    pinnedTeams: JSON.parse(localStorage.getItem('pinnedTeams')) || [],
    openMatches: [],
    openMatch: null, // Used for the inline editor toggle
    scores: []
};

let liveUpdateTimer = null;

// ---------- Save State ----------
function saveState() {
    // Save the metadata (view, category, etc)
    localStorage.setItem('tournamentState', JSON.stringify({
        cat: state.cat,
        view: state.view,
        openMatches: state.openMatches,
        scores: state.scores
    }));
    // Save the actual tournament data (the "Single Location" data)
    if (state.data) {
        localStorage.setItem('curlingDB', JSON.stringify(state.data));
    }
}
function savePinnedTeams() {
    localStorage.setItem('pinnedTeams', JSON.stringify(state.pinnedTeams));
}
// --- The New Save Function ---
async function syncToFileSystem() {
    try {
        // NOTE: Use 'localhost' on PC. 
        // Use your computer's IP (e.g. 192.168.1.50) if saving from iPhone.
        await fetch('http://localhost:3000/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.data) 
        });
    } catch (e) {
        console.warn("Local server not detected. Saved to browser memory only.");
    }
}

function commitScore(drawId, sheet) {
    const draw = state.data.draws.find(d => d.id === drawId);
    const match = draw.matches.find(m => m.sheet === sheet);

    // 1. Update the data in the app
    match.s1 = parseInt(document.getElementById(`s1-${drawId}-${sheet}`).value) || 0;
    match.s2 = parseInt(document.getElementById(`s2-${drawId}-${sheet}`).value) || 0;
    match.completed = document.getElementById(`final-${drawId}-${sheet}`).checked;

    // 2. Clear editor and update UI
    state.openMatch = null;
    render();

    // 3. Persist data
    saveState();         // Save to browser LocalStorage (safety backup)
    syncToFileSystem();  // Send to computer to update userbase.json
}
// ---------- Load Saved State ----------
const savedState = localStorage.getItem('tournamentState');
if (savedState) {
  try {
    const parsed = JSON.parse(savedState);
    state = { ...state, ...parsed };
  } catch (e) {
    console.error("Error loading saved state:", e);
  }
}
function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            state.data = importedData;
            saveState();
            render();
            alert("Database Updated Successfully!");
        } catch (err) {
            alert("Invalid JSON file. Please check the file format.");
        }
    };
    reader.readAsText(file);
}
function exportDatabase() {
    if (!state.data) return alert("No data to save!");
    const dataStr = JSON.stringify(state.data, null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'userbase.json';
    a.click();
    URL.revokeObjectURL(url);
}



// ---------- Category / View ----------
function setCategory(cat) {
  state.cat = cat;
  saveState();
}
function setCat(c) { 
    state.cat = c; 
    localStorage.setItem('lastCat', c);
    saveState();
    render(); 
}
function setView(v) { 
    state.view = v; 
    localStorage.setItem('lastView', v);
    saveState();
    render(); 
}
function setScore(matchId, score) {
  const idx = state.scores.findIndex(s => s.matchId === matchId);
  if (idx > -1) {
    state.scores[idx] = { matchId, score };
  } else {
    state.scores.push({ matchId, score });
  }
  saveState();
}


// ---------- Matches ----------
function openMatch(matchId) {
  if (!state.openMatches.includes(matchId)) {
    state.openMatches.push(matchId);
    saveState();
  }
}

function closeMatch(matchId) {
  state.openMatches = state.openMatches.filter(id => id !== matchId);
  saveState();
}
function toggleEditor(drawId, sheet) {
    const key = `${drawId}-${sheet}`;
    state.openMatch = state.openMatch === key ? null : key;
    render();
}
// ---------- Teams ----------
function pinTeam(teamId) {
  if (!state.pinnedTeams.includes(teamId)) {
    state.pinnedTeams.push(teamId);
    savePinnedTeams();
    saveState();
  }
}

function unpinTeam(teamId) {
  state.pinnedTeams = state.pinnedTeams.filter(id => id !== teamId);
  savePinnedTeams();
  saveState();
}

function togglePin(teamId, event) {
    if (event) event.stopPropagation();
    if (state.pinnedTeams.includes(teamId)) {
        state.pinnedTeams = state.pinnedTeams.filter(id => id !== teamId);
    } else {
        state.pinnedTeams.push(teamId);
    }
    savePinnedTeams();
    render();
}

function updateTeamColor(teamId, color) {
    const team = getTeam(teamId);
    if (team) {
        team.color = color;
        saveState();
        render(); 
    }
}
function updatePlaydownTeam(drawId, sheet, slot, teamId) {
  const draw = state.data.draws.find(d => d.id === drawId);
  const match = draw.matches.find(m => m.sheet === sheet);
  match[slot] = teamId;
  saveState();
  render();
}

// ---------- Helpers ----------
const isPinnedMatch = (m) => state.pinnedTeams.includes(m.t1) || state.pinnedTeams.includes(m.t2);
const getTeam = (id) => state.data?.teams.find(t => t.UTID === id);
const getFlag = (id) => `./assets/flags/canada/${getTeam(id)?.UPID.toLowerCase()}_flag.png`;
const getGenderClass = (id) => {
    if (!id || id === 'TBD') return '';
    return id.startsWith('M') ? 'gender-M' : (id.startsWith('W') ? 'gender-W' : '');
};
function toggleDrawDate(header) {
  const content = header.nextElementSibling;
  if (content.style.display === 'none') {
    content.style.display = 'block';
    header.querySelector('.toggle-indicator').textContent = '▼';
  } else {
    content.style.display = 'none';
    header.querySelector('.toggle-indicator').textContent = '▶';
  }
}

// ---------- Render Functions ----------
function generateMatchRow(m, drawId, showTime = false) {
    const isOpen = state.openMatch === `${drawId}-${m.sheet}`;
    const t1 = getTeam(m.t1) || { tname: "TBD", color: "#ccc" };
    const t2 = getTeam(m.t2) || { tname: "TBD", color: "#ccc" };

    return `
    <div class="match-row ${getGenderClass(m.t1)}">
        ${showTime ? `<div style="font-size:0.65rem; font-weight:800; color:var(--text-dim); margin-bottom:4px; padding-left:45px;">${m.time}</div>` : ''}
        
        <div class="match-summary" onclick="toggleEditor(${drawId}, '${m.sheet}')">
            <span class="sheet-label" style="color:var(--accent); font-weight:900;">${m.sheet}</span>
            <div class="t1-col">
                ${m.t1 !== 'TBD' ? `<img src="${getFlag(m.t1)}" class="flag-icon" style="width:20px;">` : ''}
                <span style="color:${t1.color || '#0f172a'}; font-weight:700;">${t1.tname}</span>
            </div>
            <span class="score-pill ${m.completed ? 'complete' : ''}">${m.s1 || 0} — ${m.s2 || 0}</span>
            <div class="t2-col">
                <span style="color:${t2.color || '#0f172a'}; font-weight:700;">${t2.tname}</span>
                ${m.t2 !== 'TBD' ? `<img src="${getFlag(m.t2)}" class="flag-icon" style="width:20px;">` : ''}
            </div>
        </div>
        ${isOpen ? `
        <div class="inline-editor">
            <div style="display:flex; justify-content:center; gap:15px; margin-bottom:20px;">
                <input type="number" id="s1-${drawId}-${m.sheet}" value="${m.s1 || 0}" inputmode="numeric" style="width:60px; text-align:center; font-size:1.2rem; padding:8px; border:1px solid #ddd; border-radius:8px;">
                <input type="number" id="s2-${drawId}-${m.sheet}" value="${m.s2 || 0}" inputmode="numeric" style="width:60px; text-align:center; font-size:1.2rem; padding:8px; border:1px solid #ddd; border-radius:8px;">
            </div>
            <label style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:20px; font-weight:700;">
                <input type="checkbox" id="final-${drawId}-${m.sheet}" ${m.completed ? 'checked' : ''} style="width:22px; height:22px;"> Final Score
            </label>
            <button onclick="commitScore(${drawId}, '${m.sheet}')" class="save-btn" style="width:100%; height:50px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:800;">SAVE RESULT</button>
        </div>` : ''}
    </div>`;
}function render() {
  const container = document.getElementById('view-container');
  if (!container) return;

  document.querySelectorAll('.pill').forEach(b => {
    b.classList.toggle('active', b.id === `cat-${state.cat}`);
  });

  const viewShort = state.view.substring(0, 3);
  document.querySelectorAll('.icon-btn').forEach(b => {
    const isMatch = b.id.includes(viewShort);
    b.classList.toggle('active', isMatch);

    const icon = b.querySelector('i');
    if (icon) {
      if (isMatch) icon.className = icon.className.replace('ph ', 'ph-fill ');
      else icon.className = icon.className.replace('ph-fill ', 'ph ');
    }
  });

  if (state.view === 'schedule') renderDrawSchedule(container);
  else if (state.view === 'team') renderTeamSchedule(container);
  else if (state.view === 'matrix') renderMatrix(container);
  else if (state.view === 'standings') renderStandings(container);
  else if (state.view === 'playdowns') renderPlaydownEditor(container);

  if (window.innerWidth < 600) window.scrollTo(0, 0);
}


function liveUpdateScore(drawId, sheet) {
  const draw = state.data.draws.find(d => d.id === drawId);
  if (!draw) return;

  const match = draw.matches.find(m => m.sheet === sheet);
  if (!match) return;

  match.s1 = parseInt(document.getElementById(`s1-${drawId}-${sheet}`).value) || 0;
  match.s2 = parseInt(document.getElementById(`s2-${drawId}-${sheet}`).value) || 0;
  match.completed = document.getElementById(`final-${drawId}-${sheet}`).checked;

  // sync to scores array
  const idx = state.scores.findIndex(
    s => s.drawId === drawId && s.sheet === sheet
  );

  const scoreObj = { drawId, sheet, ...match };

  if (idx > -1) state.scores[idx] = scoreObj;
  else state.scores.push(scoreObj);

  // debounce localStorage writes
  clearTimeout(liveUpdateTimer);
  liveUpdateTimer = setTimeout(() => {
    saveState();
  }, 300);

  render(); // live update UI
}


// ---------- Render Draw Schedule ----------
function renderDrawSchedule(container) {
  const drawsByDate = {};
  state.data.draws.forEach(d => {
    const date = d.time.split(',')[0];
    if (!drawsByDate[date]) drawsByDate[date] = [];
    drawsByDate[date].push(d);
  });

  container.innerHTML = Object.keys(drawsByDate).map(date => {
    const draws = drawsByDate[date];
    return `
        <div class="draw-date-group">
            <div class="date-header" onclick="toggleDrawDate(this)">
                <span class="toggle-indicator">▼</span> ${date}
            </div>
            <div class="date-content">
                ${draws.map(d => {
      const matches = d.matches.filter(m =>
        state.cat === 'A' || (m.t1 && m.t1.startsWith(state.cat))
      );
      if (!matches.length) return '';
      return `
                        <div class="draw-group">
                            <div style="font-weight:800; color:var(--text-dim); margin-bottom:12px; font-size:0.7rem; text-transform:uppercase;">
                                Draw ${d.id} • ${d.time}
                            </div>
                            ${matches.map(m => generateMatchRow(m, d.id)).join('')}
                        </div>`;
    }).join('')}
            </div>
        </div>`;
  }).join('');
}

// ---------- Render Team Schedule ----------
function renderTeamSchedule(container) {
    const allTeams = state.data.teams.filter(
        t => state.cat === 'A' || t.UTID.startsWith(state.cat)
    );

    const sortedTeams = [...allTeams].sort((a, b) => {
        const aP = state.pinnedTeams.includes(a.UTID);
        const bP = state.pinnedTeams.includes(b.UTID);
        return (aP === bP) ? a.tname.localeCompare(b.tname) : aP ? -1 : 1;
    });

    container.innerHTML = sortedTeams.map(team => {
        const isPinned = state.pinnedTeams.includes(team.UTID);

        // Get matches and sort them chronologically
        const teamMatches = state.data.draws.flatMap(d =>
            d.matches
                .filter(m => m.t1 === team.UTID || m.t2 === team.UTID)
                .map(m => ({
                    ...m,
                    drawId: d.id,
                    time: d.time // Grab time from the parent draw
                }))
        ).sort((a, b) => a.drawId - b.drawId); // Sort by Draw ID

        return `
            <div class="team-group ${getGenderClass(team.UTID)}" style="margin-bottom:48px; padding-left:10px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px; border-bottom:2px solid ${team.color || '#eee'}; padding-bottom:8px;">
                    <button onclick="togglePin('${team.UTID}', event)" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:${isPinned ? 'var(--accent)' : '#ccc'}">
                        <i class="${isPinned ? 'ph-fill' : 'ph'} ph-push-pin"></i>
                    </button>
                    <img src="${getFlag(team.UTID)}" class="flag-icon" style="width:24px;">
                    <h2 style="margin:0;font-size:1rem;color:${team.color || 'inherit'};flex-grow:1;">${team.tname}</h2>
                    <input type="color" value="${team.color || '#0f172a'}" onchange="updateTeamColor('${team.UTID}', this.value)">
                </div>
                ${teamMatches.map(m => generateMatchRow(m, m.drawId, true)).join('')}
            </div>
        `;
    }).join('');
}

// ---------- Render Matrix ----------
function renderMatrix(container) {
  const activePools = state.data.pools.filter(p => state.cat === 'A' || p.id.startsWith(state.cat));
  container.innerHTML = activePools.map(pool => {
    const poolTeams = pool.teams.map(tid => getTeam(tid)).filter(t => t);
    const headerColor = pool.id.startsWith('M') ? 'var(--accent-blue)' : 'var(--accent)';

    return `
        <div class="pool-container" style="margin-bottom: 50px;">
            <div style="background: ${headerColor}; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-weight: 800; display: flex; justify-content: space-between;">
                <span>${pool.name.toUpperCase()}</span>
                <span style="font-size: 0.7rem; opacity: 0.8;">ROUND RR</span>
            </div>
            <div style="overflow-x: auto; border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px;">
                <table style="width: 100%; border-collapse: collapse; background: white; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: var(--surface);">
                            <th style="text-align: left; padding: 12px; border-bottom: 2px solid var(--border); width: 180px;">Team</th>
                            ${poolTeams.map((_, i) => `<th style="width: 40px; text-align: center; border-left: 1px solid var(--border); border-bottom: 2px solid var(--border);">${i + 1}</th>`).join('')}
                            <th style="width: 60px; text-align: center; background: #eef2f7; border-bottom: 2px solid var(--border);">W-L</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${poolTeams.map((rowTeam, i) => {
      let w = 0, l = 0;
      const cells = poolTeams.map((colTeam, j) => {
        if (i === j) return `<td style="background: #e2e8f0; border-left: 1px solid var(--border);"></td>`;
        const m = state.data.draws.flatMap(d => d.matches).find(match =>
          match.completed && (
            (match.t1 === rowTeam.UTID && match.t2 === colTeam.UTID) ||
            (match.t1 === colTeam.UTID && match.t2 === rowTeam.UTID)
          )
        );
        if (!m) return `<td style="border-left: 1px solid var(--border); text-align: center; color: #cbd5e1;">-</td>`;
        const won = (m.t1 === rowTeam.UTID) ? (m.s1 > m.s2) : (m.s2 > m.s1);
        won ? w++ : l++;
        return `<td style="border-left: 1px solid var(--border); text-align: center; font-weight: 800; color: ${won ? 'var(--success)' : '#ef4444'};">${won ? 'W' : 'L'}</td>`;
      }).join('');
      return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 10px 12px; font-weight: 600;">${rowTeam.tname}</td>
                                ${cells}
                                <td style="text-align: center; font-weight: 900; background: var(--surface); border-left: 1px solid var(--border);">${w}-${l}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
  }).join('');
}

// ---------- Render Playdown Editor ----------
function renderPlaydownEditor(container) {
  const playdownDraws = state.data.draws.filter(d => d.id >= 15);
  if (!playdownDraws.length) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-dim); margin-top:50px;">No playoff draws available yet.</div>`;
    return;
  }

  container.innerHTML = playdownDraws.map(d => {
    return `
        <div class="draw-group" style="margin-bottom:40px">
            <div style="font-weight:900; color:var(--accent); margin-bottom:12px; border-bottom:1px solid var(--border); font-size:0.9rem;">
                ${d.time.toUpperCase()}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:12px;">
                ${d.matches.map(m => {
      const t1 = getTeam(m.t1) || { tname: "TBD", color: "#ccc" };
      const t2 = getTeam(m.t2) || { tname: "TBD", color: "#ccc" };
      const gClass = getGenderClass(m.t1);

      return `
                    <div class="match-card ${gClass}" style="flex:1 1 200px; background:white; border:1px solid var(--border); border-radius:12px; padding:15px;">
                        <div style="font-size:0.65rem; font-weight:800; color:var(--text-dim); margin-bottom:8px;">${m.note || 'Playoff'} • Sheet ${m.sheet}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
                            <span style="color:${t1.color || '#0f172a'}; font-weight:700;">${t1.tname}</span>
                            <span style="font-weight:900; color:var(--border);">VS</span>
                            <span style="color:${t2.color || '#0f172a'}; font-weight:700;">${t2.tname}</span>
                        </div>
                        <div style="display:flex; justify-content:center; gap:12px; margin-bottom:12px;">
                            <input type="number" id="s1-${d.id}-${m.sheet}" value="${m.s1 || 0}" style="width:60px; text-align:center; border:1px solid var(--border); border-radius:6px; height:36px;">
                            <input type="number" id="s2-${d.id}-${m.sheet}" value="${m.s2 || 0}" style="width:60px; text-align:center; border:1px solid var(--border); border-radius:6px; height:36px;">
                        </div>
                        <label style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:12px; font-weight:700;">
                            <input type="checkbox" id="final-${d.id}-${m.sheet}" ${m.completed ? 'checked' : ''} style="width:20px; height:20px;"> Final Score
                        </label>
                        <button onclick="commitScore(${d.id}, '${m.sheet}')" style="width:100%; height:40px; font-weight:700; border:none; border-radius:6px; background:var(--accent); color:white;">Save</button>
                    </div>`;
    }).join('')}
            </div>
        </div>`;
  }).join('');
}

// ---------- Initialization ----------
async function init() {
    // 1. Try loading from LocalStorage first (The "Single Location")
    const savedDB = localStorage.getItem('curlingDB');
    const savedMeta = localStorage.getItem('tournamentState');

    if (savedDB) {
        state.data = JSON.parse(savedDB);
        console.log("Loaded from local memory");
    } else {
        // 2. Fallback to the original file
        try {
            const res = await fetch('userbase.json');
            state.data = await res.json();
            console.log("Loaded from userbase.json file");
        } catch (err) {
            console.error("Data load failed:", err);
        }
    }

    // Load metadata if it exists
    if (savedMeta) {
        const meta = JSON.parse(savedMeta);
        state.cat = meta.cat || state.cat;
        state.view = meta.view || state.view;
    }

    render();
}

function liveUpdateScore(drawId, sheet) {
  const draw = state.data.draws.find(d => d.id === drawId);
  if (!draw) return;

  const match = draw.matches.find(m => m.sheet === sheet);
  if (!match) return;

  match.s1 = parseInt(document.getElementById(`s1-${drawId}-${sheet}`).value) || 0;
  match.s2 = parseInt(document.getElementById(`s2-${drawId}-${sheet}`).value) || 0;
  match.completed = document.getElementById(`final-${drawId}-${sheet}`).checked;

  // sync to scores array
  const idx = state.scores.findIndex(
    s => s.drawId === drawId && s.sheet === sheet
  );

  const scoreObj = { drawId, sheet, ...match };

  if (idx > -1) state.scores[idx] = scoreObj;
  else state.scores.push(scoreObj);

  // debounce localStorage writes
  clearTimeout(liveUpdateTimer);
  liveUpdateTimer = setTimeout(() => {
    saveState();
  }, 300);

  render(); // live update UI
}

function renderStandings(container) {

  function buildStandingsTable(title, teams) {

    const rows = teams.map(team => {

      let games = 0;
      let wins = 0;
      let losses = 0;
      let pointsFor = 0;
      let pointsAgainst = 0;

      state.data.draws.forEach(draw => {
        draw.matches.forEach(m => {

          if (!m.completed) return;

          if (m.t1 === team.UTID || m.t2 === team.UTID) {

            games++;

            const isT1 = m.t1 === team.UTID;
            const pf = isT1 ? m.s1 : m.s2;
            const pa = isT1 ? m.s2 : m.s1;

            pointsFor += pf;
            pointsAgainst += pa;

            if (pf > pa) wins++;
            else losses++;
          }
        });
      });

      return {
        team,
        games,
        wins,
        losses,
        pointsFor,
        pointsAgainst,
        diff: pointsFor - pointsAgainst
      };
    });

    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pointsFor - a.pointsFor;
    });

    return `
        <div style="margin-bottom:50px;">
            <div style="
                font-weight:900;
                font-size:0.9rem;
                margin-bottom:12px;
                color:${title.startsWith('MEN') ? 'var(--accent-blue)' : 'var(--accent)'};
                border-bottom:2px solid var(--border);
                padding-bottom:6px;
            ">
                ${title}
            </div>

            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; background:white; font-size:0.85rem;">
                    <thead>
                        <tr style="background:var(--surface);">
                          <th>Prov</th>
                            <th style="text-align:left; padding:10px;">Team Standing</th>
                            <th style="width:40px;">Games Played</th>
                            <th style="width:50px;">W</th>
                            <th style="width:50px;">L</th>
                            <th style="width:70px;">Points</th>
                            <th style="width:70px;">Opponents</th>
                            <th style="width:70px;">Difference</th>
                        </tr>
                    </thead>
                    <tbody>
    ${rows.map((r, i) => `
    <tr style="
        border-bottom:1px solid var(--border);
        background:${state.pinnedTeams.includes(r.team.UTID)
        ? 'rgba(56,189,248,0.08)'
        : 'transparent'};">
        
        <!-- Flag column -->
        <td style="padding:10px; width:40px; text-align:center;">
            <img src="${getFlag(r.team.UTID)}" style="width:30px; height:auto;">
        </td>

        <!-- Team name column -->
        <td style="padding:6px; max-width:200px; width:100px; font-weight:700; color:${r.team.color || '#0f172a'};">
            ${i + 1}. ${r.team.tname}
        </td>

        <td style="text-align:center;">${r.games}</td>
        <td style="text-align:center; font-weight:800; color:var(--success);">${r.wins}</td>
        <td style="text-align:center; font-weight:800; color:#ef4444;">${r.losses}</td>
        <td style="text-align:center;">${r.pointsFor}</td>
        <td style="text-align:center;">${r.pointsAgainst}</td>
        <td style="text-align:center; font-weight:800;">
            ${r.diff > 0 ? '+' : ''}${r.diff}
        </td>
    </tr>
    `).join('')}
</tbody>

                </table>
            </div>
        </div>`;
  }

  const mensTeams = state.data.teams.filter(t => t.UTID.startsWith('M'));
  const womensTeams = state.data.teams.filter(t => t.UTID.startsWith('W'));

  container.innerHTML = `
    ${buildStandingsTable('MEN\'S STANDINGS', mensTeams)}
    ${buildStandingsTable('WOMEN\'S STANDINGS', womensTeams)}
`;

}
function toggleDrawDate(header) {
    const content = header.nextElementSibling;
    const indicator = header.querySelector('.toggle-indicator');
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    indicator.textContent = isHidden ? '▼' : '▶';
}

init();