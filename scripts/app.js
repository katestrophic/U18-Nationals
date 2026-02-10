let liveUpdateTimer = null;
let renderDebounceTimer = null;
let commitDebounceTimer = null;
let state = {
  data: null,
  cat: localStorage.getItem('lastCat') || "A",
  view: localStorage.getItem('lastView') || "schedule",
  pinnedTeams: JSON.parse(localStorage.getItem('pinnedTeams')) || [],
  openMatches: [],
  openMatch: null,
  scores: [],
  foldedDates: JSON.parse(localStorage.getItem('foldedDates')) || {},
  foldedDraws: JSON.parse(localStorage.getItem('foldedDraws')) || {}
};

const savedState = localStorage.getItem('tournamentState');
if (savedState) {
  try {
    const parsed = JSON.parse(savedState);
    state = { ...state, ...parsed };
    state.foldedDates = parsed.foldedDates || {};
    state.foldedDraws = parsed.foldedDraws || {};
  } catch (e) {
    console.error("Error loading saved state:", e);
  }
}

const isPinnedMatch = (m) => state.pinnedTeams.includes(m.t1) || state.pinnedTeams.includes(m.t2);
const getTeam = (id) => state.data?.teams.find(t => t.UTID === id);
const getFlag = (id) => `./assets/flags/canada/${getTeam(id)?.UPID.toLowerCase()}_flag.png`;
const getGenderClass = (id) => {
  if (!id || id === 'TBD') return '';
  return id.startsWith('M') ? 'gender-M' : (id.startsWith('W') ? 'gender-W' : '');
};


// CRUD ----------
function saveState() {
  localStorage.setItem('tournamentState', JSON.stringify({
    cat: state.cat,
    view: state.view,
    openMatches: state.openMatches,
    scores: state.scores,
    foldedDates: state.foldedDates,
    foldedDraws: state.foldedDraws
  }));
}
function savePinnedTeams() {
  localStorage.setItem('pinnedTeams', JSON.stringify(state.pinnedTeams));
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
async function syncToFileSystem() {
  try {
    await fetch('http://localhost:3000/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data)
    });
  } catch (e) {
    console.warn("Local server not detected. Saved to browser memory only.");
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
      render();
      alert("Database Updated Successfully!");
    } catch (err) {
      alert("Invalid JSON file. Please check the file format.");
    }
  };
  reader.readAsText(file);
}
function exportDatabase() {
  if (!state.data) return alert("No data to export!");
  const dataStr = JSON.stringify(state.data, null, 4);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'userbase.json';
  a.click();
  URL.revokeObjectURL(url);
}

function isPastDate(dateStr) {
  const year = 2026;
  const d = new Date(`${dateStr} ${year}`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}


// Category / View ----------
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


// Matches ----------
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


// Teams ----------
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


// Draw Functions ----------
function toggleDraw(header) {
  const key = header.dataset.drawKey;
  const content = header.nextElementSibling;
  const indicator = header.querySelector('.toggle-indicator');

  const isHidden = content.style.display === 'none';

  content.style.display = isHidden ? 'block' : 'none';
  indicator.textContent = isHidden ? '▼' : '▶';

  state.foldedDraws[key] = !isHidden;
  localStorage.setItem('foldedDraws', JSON.stringify(state.foldedDraws));
}
function toggleDrawDate(header) {
  const date = header.dataset.date;
  const content = header.nextElementSibling;
  const indicator = header.querySelector('.toggle-indicator');

  const isHidden = content.style.display === 'none';

  content.style.display = isHidden ? 'block' : 'none';
  indicator.textContent = isHidden ? '▼' : '▶';

  state.foldedDates[date] = !isHidden;
  localStorage.setItem('foldedDates', JSON.stringify(state.foldedDates));
}

function updateFoldStates(drawId, date) {
  const draw = state.data.draws.find(d => d.id === drawId);
  if (!draw) return;

  const drawKey = `${date}__${drawId}`;
  // Auto-fold draw only if not manually toggled
  if (!(drawKey in state.foldedDraws)) {
    state.foldedDraws[drawKey] = draw.matches.every(m => m.completed);
  }

  // Auto-fold date only if not manually toggled
  if (!(date in state.foldedDates)) {
    const drawsForDate = state.data.draws.filter(d => d.time.split(',')[0] === date);
    state.foldedDates[date] = drawsForDate.every(d => d.matches.every(m => m.completed));
  }
}
function updateScoresArray(drawId, sheet, s1, s2, completed) {
  const idx = state.scores.findIndex(s => s.drawId === drawId && s.sheet === sheet);
  const scoreObj = { drawId, sheet, s1, s2, completed };

  if (idx > -1) state.scores[idx] = scoreObj;
  else state.scores.push(scoreObj);
}
function commitScore(drawId, sheet) {
  const draw = state.data.draws.find(d => d.id === drawId);
  if (!draw) return;

  const match = draw.matches.find(m => m.sheet === sheet);
  if (!match) return;

  // Prevent negative scores
  match.s1 = Math.max(0, parseInt(document.getElementById(`s1-${drawId}-${sheet}`).value) || 0);
  match.s2 = Math.max(0, parseInt(document.getElementById(`s2-${drawId}-${sheet}`).value) || 0);
  match.completed = document.getElementById(`final-${drawId}-${sheet}`).checked;

  const date = draw.time.split(',')[0];
  updateScoresArray(drawId, sheet, match.s1, match.s2, match.completed);
  updateFoldStates(drawId, date);

  state.openMatch = null;

  // Debounce saving to localStorage and file system
  clearTimeout(commitDebounceTimer);
  commitDebounceTimer = setTimeout(() => {
    saveState();
    syncToFileSystem();
    render(); // render after save
  }, 150); // wait 150ms of inactivity before committing
}


// Render Functions ----------
function generateMatchRow(m, drawId, showTime = false) {
  const isOpen = state.openMatch === `${drawId}-${m.sheet}`;
  const t1 = getTeam(m.t1) || { tname: "TBD", color: "#ccc" };
  const t2 = getTeam(m.t2) || { tname: "TBD", color: "#ccc" };

  return `
    <div class="match-row ${getGenderClass(m.t1)}" data-draw="${drawId}" data-sheet="${m.sheet}">
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
}
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
        ${(() => {
        // Determine if all draws on this date are complete
        const autoFold = draws.every(d => d.matches.every(m => m.completed));
        const isFolded = state.foldedDates[date] ?? autoFold;
        const indicator = isFolded ? '▶' : '▼';

        return `
            <div class="date-header" data-date="${date}" onclick="toggleDrawDate(this)">
              <span class="toggle-indicator">${indicator}</span> ${date}
            </div>
            <div class="date-content" style="display:${isFolded ? 'none' : 'block'};">
          `;
      })()}

        ${draws.map(d => {
        const matches = d.matches.filter(m => state.cat === 'A' || (m.t1 && m.t1.startsWith(state.cat)));
        if (!matches.length) return '';
        const drawKey = `${date}__${d.id}`;

        // Auto-fold if ALL matches in the draw are complete
        const isDrawFolded = state.foldedDraws[drawKey] ?? d.matches.every(m => m.completed);
        const drawIndicator = isDrawFolded ? '▶' : '▼';

        return `
            <div class="draw-group">
              <div class="draw-header"
                   data-draw-key="${drawKey}"
                   onclick="toggleDraw(this)"
                   style="cursor:pointer; font-weight:800; color:var(--text-dim); margin-bottom:6px; font-size:0.7rem; text-transform:uppercase; display:flex; align-items:center; gap:6px;">
                <span class="toggle-indicator">${drawIndicator}</span>
                Draw ${d.id} • ${d.time}
              </div>

              <div class="draw-content" style="display:${isDrawFolded ? 'none' : 'block'};">
                ${matches.map(m => generateMatchRow(m, d.id)).join('')}
              </div>
            </div>`;
      }).join('')}
      </div>`;
  }).join('');
}
function renderTeamSchedule(container) {
  const allTeams = state.data.teams.filter(t => state.cat === 'A' || t.UTID.startsWith(state.cat));

  const sortedTeams = [...allTeams].sort((a, b) => {
    const aP = state.pinnedTeams.includes(a.UTID);
    const bP = state.pinnedTeams.includes(b.UTID);
    return (aP === bP) ? a.tname.localeCompare(b.tname) : aP ? -1 : 1;
  });

  container.innerHTML = sortedTeams.map(t => {
    const isPinned = state.pinnedTeams.includes(t.UTID);

    const matches = state.data.draws.flatMap(d =>
      d.matches.filter(m => m.t1 === t.UTID || m.t2 === t.UTID)
        .map(m => ({ ...m, drawId: d.id, time: d.time }))
    ).sort((a, b) => a.drawId - b.drawId);

    return `
      <div class="team-group ${getGenderClass(t.UTID)}" style="margin-bottom:48px; padding-left:10px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px; border-bottom:2px solid ${t.color || '#eee'}; padding-bottom:8px;">
          <img src="${getFlag(t.UTID)}" class="flag-icon" style="width:40px;">
          <h2 style="margin:0;font-size:1rem;color:${t.color || 'inherit'};flex-grow:1;">${t.tname}</h2>
          <input type="color" value="${t.color || '#0f172a'}" onchange="updateTeamColor('${t.UTID}', this.value)">
          <button onclick="togglePin('${t.UTID}', event)" style="background:none;border:none;cursor:pointer;font-size:1.5rem;color:${isPinned ? 'var(--accent)' : '#ccc'}">
            <i class="${isPinned ? 'ph-fill' : 'ph'} ph-push-pin"></i>
          </button>
        </div>
        ${matches.map(m => generateMatchRow(m, m.drawId, true)).join('')}
      </div>`;
  }).join('');
}
function renderMatrix(container) {
  const activePools = state.data.pools.filter(p => state.cat === 'A' || p.id.startsWith(state.cat));
  container.innerHTML = activePools.map(p => {
    const poolTeams = p.teams.map(tid => getTeam(tid)).filter(t => t);
    const headerColor = p.id.startsWith('M') ? 'var(--accent-blue)' : 'var(--accent)';

    return `
      <div class="pool-container" style="margin-bottom:50px;">
        <div style="background:${headerColor}; color:white; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:800; display:flex; justify-content:space-between;">
          <span>${p.name.toUpperCase()}</span>
          <span style="font-size:0.7rem; opacity:0.8;">RR</span>
        </div>
        <div style="overflow-x:auto; border:1px solid var(--border); border-top:none; border-radius:0 0 8px 8px;">
          <table style="width:100%; border-collapse:collapse; background:white; font-size:1rem; table-layout: fixed;">
            <thead>
              <tr style="background:var(--surface);">
                <th style="width: 120px; text-align:center; border-bottom:2px solid var(--border);">Team (W-L)</th>
                ${poolTeams.map((_, i) => `<th style="min-width:60px; text-align:center; border-bottom:2px solid var(--border);">
                  <img src="${getFlag(poolTeams[i].UTID)}" class="flag-icon" style="width:5vw; max-width:50px;">
                </th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${poolTeams.map((t, i) => {
        let w = 0, l = 0;
        const cells = poolTeams.map((opp, j) => {
          if (i === j) return `<td style="background:#e2e8f0; border-right:1px solid var(--border);"></td>`;
          const m = state.data.draws.flatMap(d => d.matches)
            .find(match => match.completed &&
              ((match.t1 === t.UTID && match.t2 === opp.UTID) ||
               (match.t1 === opp.UTID && match.t2 === t.UTID))
            );
          if (!m) return `<td style="border-right:1px solid var(--border); text-align:center; color:#cbd5e1;">-</td>`;
          const won = (m.t1 === t.UTID) ? (m.s1 > m.s2) : (m.s2 > m.s1);
          won ? w++ : l++;
          return `<td style="border-right:1px solid var(--border); text-align:center; font-weight:800; color:${won ? 'var(--success)' : '#ef4444'};">${won ? 'W' : 'L'}</td>`;
        }).join('');

        // Left column: team name + W-L over the flag, fixed width
        const skipName = (t.tname.match(/\(([^)]+)\)/) || [])[1] || t.tname;
        return `<tr style="border-bottom:1px solid var(--border);">
                  <td style="
                    width:120px;
                    font-weight: 1000;
                    color:white;
                    -webkit-text-stroke: 1px black;
                    text-align:center;
                    background: url('${getFlag(t.UTID)}');
                    background-size:contain;
                    background-repeat:no-repeat;
                    background-position:center;
                    height:70px;
                    opacity: 0.5;
                    vertical-align:middle;
                    font-size:1rem;
                    line-height:1.2rem;
                  ">
                    ${skipName}<br>${w}-${l}
                  </td>
                  ${cells}
                </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

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
function renderStandings(container) {
  function buildStandingsTable(title, teams) {
    const rows = teams.map(t => {
      let games = 0, wins = 0, losses = 0, pf = 0, pa = 0;
      state.data.draws.forEach(d => d.matches.forEach(m => {
        if (!m.completed) return;
        if (m.t1 === t.UTID || m.t2 === t.UTID) {
          games++;
          const isT1 = m.t1 === t.UTID;
          pf += isT1 ? m.s1 : m.s2;
          pa += isT1 ? m.s2 : m.s1;
          isT1 ? (m.s1 > m.s2 ? wins++ : losses++) : (m.s2 > m.s1 ? wins++ : losses++);
        }
      }));
      return { t, games, wins, losses, pf, pa, diff: pf - pa };
    });

    rows.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf);

    return `
      <div style="margin-bottom:50px;">
        <div style="font-weight:900;font-size:0.9rem;margin-bottom:12px;color:${title.startsWith('MEN') ? 'var(--accent-blue)' : 'var(--accent)'};border-bottom:2px solid var(--border);padding-bottom:6px;">
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
                <tr style="border-bottom:1px solid var(--border); background:${state.pinnedTeams.includes(r.t.UTID) ? 'rgba(56,189,248,0.08)' : 'transparent'}">
                  <td style="padding:10px; width:40px; text-align:center;"><img src="${getFlag(r.t.UTID)}" style="width:30px;"></td>
                  <td style="padding:6px; max-width:200px; font-weight:700; color:${r.t.color || '#0f172a'};">${i + 1}. ${r.t.tname}</td>
                  <td style="text-align:center;">${r.games}</td>
                  <td style="text-align:center; font-weight:800; color:var(--success);">${r.wins}</td>
                  <td style="text-align:center; font-weight:800; color:#ef4444;">${r.losses}</td>
                  <td style="text-align:center;">${r.pf}</td>
                  <td style="text-align:center;">${r.pa}</td>
                  <td style="text-align:center; font-weight:800;">${r.diff > 0 ? '+' : ''}${r.diff}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  container.innerHTML = `
    ${buildStandingsTable("MEN'S STANDINGS", state.data.teams.filter(t => t.UTID.startsWith('M')))}
    ${buildStandingsTable("WOMEN'S STANDINGS", state.data.teams.filter(t => t.UTID.startsWith('W')))}
  `;
}

function liveUpdateScore(drawId, sheet) {
  const s1 = document.getElementById(`s1-${drawId}-${sheet}`).value;
  const s2 = document.getElementById(`s2-${drawId}-${sheet}`).value;
  const completed = document.getElementById(`final-${drawId}-${sheet}`).checked;

  updateMatch(drawId, sheet, s1, s2, completed);
}

function render() {
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


// Initialization ----------
async function init() {
  try {
    const res = await fetch('userbase.json');
    state.data = await res.json();
    console.log("Loaded from userbase.json file");
  } catch (err) {
    console.error("Data load failed:", err);
  }

  const savedMeta = localStorage.getItem('tournamentState');
  if (savedMeta) {
    const meta = JSON.parse(savedMeta);
    state.cat = meta.cat || state.cat;
    state.view = meta.view || state.view;
    state.scores = meta.scores || [];
    state.openMatches = meta.openMatches || [];
    state.foldedDates = meta.foldedDates || {};
    state.foldedDraws = meta.foldedDraws || {};
    state.pinnedTeams = JSON.parse(localStorage.getItem('pinnedTeams')) || [];
  }

  render();
}

init();