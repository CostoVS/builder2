import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { spawn } from "child_process";
import cors from "cors";
import cookieParser from "cookie-parser";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;
  const DEPLOYED_SITES_DIR = path.join(process.cwd(), "deployed-sites");
  const TEMP_BUILD_DIR = path.join(process.cwd(), "temp-build");
  const SITES_CONFIG_PATH = path.join(DEPLOYED_SITES_DIR, "sites.json");

  // Ensure directories exist
  await fs.ensureDir(DEPLOYED_SITES_DIR);
  await fs.ensureDir(TEMP_BUILD_DIR);
  if (!await fs.pathExists(SITES_CONFIG_PATH)) {
    await fs.writeJson(SITES_CONFIG_PATH, []);
  }

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser(process.env.AUTH_SECRET || "super-secret-key"));

  const AUTH_USERNAME = "admin";
  const AUTH_PASSWORD = "Nic6604211989!";

  // Auth Middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.signedCookies.auth === "true") {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // Login Endpoint
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
      res.cookie("auth", "true", { 
        signed: true, 
        httpOnly: true, 
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie("auth");
    res.json({ success: true });
  });

  // Check Auth State
  app.get("/api/auth-check", (req, res) => {
    res.json({ isAuthenticated: req.signedCookies.auth === "true" });
  });

  // Setup storage for uploaded ZIPs
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, TEMP_BUILD_DIR);
    },
    filename: (req, file, cb) => {
      cb(null, `upload-${Date.now()}.zip`);
    },
  });
  const upload = multer({ storage });

  // API: Get all sites
  app.get("/api/sites", requireAuth, async (req, res) => {
    try {
      const sites = await fs.readJson(SITES_CONFIG_PATH);
      res.json(sites);
    } catch (e) {
      res.json([]);
    }
  });

  // API: Download site as ZIP
  app.get("/api/sites/:slug/download", requireAuth, async (req, res) => {
    const { slug } = req.params;
    const siteDir = path.join(DEPLOYED_SITES_DIR, slug);
    
    if (await fs.pathExists(siteDir)) {
      const zip = new AdmZip();
      zip.addLocalFolder(siteDir);
      const zipBuffer = zip.toBuffer();
      
      res.set("Content-Type", "application/zip");
      res.set("Content-Disposition", `attachment; filename=${slug}.zip`);
      res.send(zipBuffer);
    } else {
      res.status(404).json({ error: "Site not found" });
    }
  });

  // API: Delete site
  app.delete("/api/sites/:slug", requireAuth, async (req, res) => {
    const { slug } = req.params;
    const siteDir = path.join(DEPLOYED_SITES_DIR, slug);
    
    if (await fs.pathExists(siteDir)) {
      await fs.remove(siteDir);
      const sites = await fs.readJson(SITES_CONFIG_PATH);
      const updatedSites = sites.filter((s: any) => s.slug !== slug);
      await fs.writeJson(SITES_CONFIG_PATH, updatedSites);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Site not found" });
    }
  });

  // API: Upload and build
  app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    const { slug, name } = req.body;
    const file = req.file;

    if (!file || !slug) {
      return res.status(400).json({ error: "File and slug are required" });
    }

    const sites = await fs.readJson(SITES_CONFIG_PATH);
    if (sites.find((s: any) => s.slug === slug)) {
      return res.status(400).json({ error: "Slug already exists" });
    }

    const buildId = Date.now().toString();
    const siteTempDir = path.join(TEMP_BUILD_DIR, buildId);

    res.json({ buildId, message: "Build started" });

    // Handle background build process
    (async () => {
      try {
        io.emit("build-step", { buildId, step: "Extracting ZIP...", status: "running" });
        const zip = new AdmZip(file.path);
        zip.extractAllTo(siteTempDir, true);
        await fs.remove(file.path);

        const runCmd = (cmd: string, args: string[], cwd: string) => {
          return new Promise<void>((resolve, reject) => {
            const proc = spawn(cmd, args, { cwd, shell: true });
            proc.stdout.on("data", (data) => {
              io.emit("build-log", { buildId, log: data.toString() });
            });
            proc.stderr.on("data", (data) => {
              io.emit("build-log", { buildId, log: data.toString(), type: "error" });
            });
            proc.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Command ${cmd} failed with code ${code}`));
            });
          });
        };

        io.emit("build-step", { buildId, step: "Running npm install...", status: "running" });
        try {
          await runCmd("npm", ["install"], siteTempDir);
        } catch (e) {
          io.emit("build-log", { buildId, log: "Standard install failed, trying legacy-peer-deps..." });
          await runCmd("npm", ["install", "--legacy-peer-deps"], siteTempDir);
        }

        io.emit("build-step", { buildId, step: "Running npm run build...", status: "running" });
        
        // Patch package.json to include base path for Vite
        try {
          const pkgPath = path.join(siteTempDir, "package.json");
          if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath);
            if (pkg?.scripts?.build && pkg.scripts.build.includes("vite build") && !pkg.scripts.build.includes("--base")) {
              pkg.scripts.build = pkg.scripts.build.replace("vite build", `vite build --base=/${slug}/`);
              await fs.writeJson(pkgPath, pkg, { spaces: 2 });
              io.emit("build-log", { buildId, log: `Injected --base=/${slug}/ into build script.` });
            }
          }
        } catch(e) {}
        
        await runCmd("npm", ["run", "build"], siteTempDir);

        const distPath = path.join(siteTempDir, "dist");
        if (!await fs.pathExists(distPath)) {
          throw new Error("Build finished but 'dist' folder not found.");
        }

        const finalPath = path.join(DEPLOYED_SITES_DIR, slug);
        await fs.ensureDir(finalPath);
        await fs.copy(distPath, finalPath);

        const newSite = {
          slug,
          name: name || slug,
          createdAt: new Date().toISOString(),
          url: `/${slug}/`
        };

        const currentSites = await fs.readJson(SITES_CONFIG_PATH);
        currentSites.push(newSite);
        await fs.writeJson(SITES_CONFIG_PATH, currentSites);

        io.emit("build-complete", { buildId, slug, success: true });
      } catch (error: any) {
        console.error("Build Failed:", error);
        io.emit("build-complete", { buildId, success: false, error: error.message });
      } finally {
        await fs.remove(siteTempDir);
      }
    })();
  });

  // Serve deployed sites by slug
  app.get('/:slug*', async (req, res, next) => {
    const slug = req.params.slug;
    
    // Safety: ignore core builder paths completely
    if (['api', 'assets', '@vite', 'src', 'node_modules', 'favicon.ico'].includes(slug)) {
      return next();
    }

    // Only intercept if the slug actually exists in our deployments
    let sites = [];
    try {
      sites = await fs.readJson(SITES_CONFIG_PATH);
    } catch (e) {}

    const site = sites.find((s: any) => s.slug === slug);
    
    if (site) {
      const filePath = req.params[0] || '/index.html';
      const absolutePath = path.join(DEPLOYED_SITES_DIR, slug, filePath);
      
      if (await fs.pathExists(absolutePath)) {
        return res.sendFile(absolutePath);
      } else {
        // Handle SPA routing: serve index.html for unknown sub-paths of a valid slug
        return res.sendFile(path.join(DEPLOYED_SITES_DIR, slug, 'index.html'));
      }
    }
    
    // If not a valid site, let the main builder app handle it (or show 404)
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
