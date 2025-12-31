import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createHttpTable } from "./db.js";
import apiRoutes from "./routes.js";
import {
    httpCheckAndSave,
    locationGroups,
} from "./httpCheck.js";

const app = express();
const port = 3000;

app.use(express.json());
app.use(apiRoutes);

app.listen(port, async () => {
    console.log(`Server listening at http://localhost:${port}`);
    await createHttpTable();

    const runChecks = (locations) => {
        httpCheckAndSave(locations).catch((err) =>
            console.error("Check cycle failed:", err)
        );
    };

    // Initial run
    runChecks(locationGroups["2min"]);

    // Scheduled runs
    setInterval(() => runChecks(locationGroups["2min"]), 3 * 60 * 1000);
    setInterval(() => runChecks(locationGroups["6min"]), 6 * 60 * 1000);
});