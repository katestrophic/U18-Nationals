const express = require('express');
const fs = require('fs');
const cors = require('cors'); 
const app = express();

app.use(cors()); // Allows browser to talk to server
app.use(express.json({ limit: '50mb' })); // Handles large tournament data

app.post('/save', (req, res) => {
    // Overwrites your actual file in the project folder
    fs.writeFile('./userbase.json', JSON.stringify(req.body, null, 4), (err) => {
        if (err) {
            console.error("Save failed:", err);
            return res.status(500).send("Error");
        }
        console.log("userbase.json updated successfully!");
        res.send({ status: "Saved" });
    });
});

// '0.0.0.0' allows your iPhone to find the server on your Wi-Fi
app.listen(3000, '0.0.0.0', () => console.log('Save Helper Active on Port 3000'));