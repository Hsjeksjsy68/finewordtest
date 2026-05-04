import fs from "fs";
import https from "https";
import path from "path";
import { execSync } from "child_process";

const url = "https://dl.dafont.com/dl/?f=heading_now";
const destZip = path.join(process.cwd(), "font.zip");
const destDir = path.join(process.cwd(), "public", "fonts");

fs.mkdirSync(destDir, { recursive: true });

console.log("Downloading...");
https.get(url, (res) => {
  if (res.statusCode === 302 || res.statusCode === 301) {
    https.get(res.headers.location, (res2) => {
      pipeToFile(res2);
    });
  } else {
    pipeToFile(res);
  }
});

function pipeToFile(res) {
  const file = fs.createWriteStream(destZip);
  res.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Downloaded. Extracting...");
    try {
      execSync(`npx -y decompress-cli font.zip --out-dir ${destDir}`);
      console.log("Extracted successfully.");
      const files = fs.readdirSync(destDir);
      console.log("Found files:", files);
    } catch (e) {
      console.error("Error extracting:", e);
    }
  });
}
