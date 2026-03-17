import express from "express";\nconst app = express();\napp.get("/", (req, res) => res.json({ ok: true }));\napp.listen(3000, () => console.log("Server on 3000"));
