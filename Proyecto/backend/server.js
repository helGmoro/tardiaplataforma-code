const express = require("express")
const cors = require("cors")
const mysql = require("mysql2/promise")
const bcrypt = require("bcryptjs")
const fs = require("fs").promises
const path = require("path")
const { exec } = require("child_process")
const { promisify } = require("util")

require("dotenv").config({ path: path.join(__dirname, ".env") })

// Enhanced logging con más detalles
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`
  console.log(logMessage)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

const app = express()
const execAsync = promisify(exec)

// Enhanced error handling con más información
process.on("uncaughtException", (error) => {
  log("error", "Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  })
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  log("error", "Unhandled Rejection:", {
    reason: reason,
    promise: promise,
    stack: reason?.stack,
  })
  process.exit(1)
})

// Middleware

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : []

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origen (como Postman)
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      } else {
        console.warn("⛔ Bloqueado por CORS:", origin)
        return callback(new Error("CORS not allowed: " + origin))
      }
    },
    credentials: true,
  })
)

app.use(express.json({ limit: "10mb" }))
app.use(express.static("public"))

const PORT = process.env.PORT || 3000
const MYSQL_HOST = process.env.MYSQL_HOST || "localhost"
const MYSQL_PORT = process.env.MYSQL_PORT || 3306
const MYSQL_USER = process.env.MYSQL_USER || "root"
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || ""
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "cloud_bot_platform"
const KUBERNETES_NAMESPACE = process.env.KUBERNETES_NAMESPACE || "bot-platform"

log("info", "Starting Cloud Bot Platform API", {
  port: PORT,
  mysqlHost: MYSQL_HOST,
  mysqlPort: MYSQL_PORT,
  mysqlDatabase: MYSQL_DATABASE,
  kubernetesNamespace: KUBERNETES_NAMESPACE,
  nodeVersion: process.version,
  platform: process.platform,
  workingDirectory: process.cwd(),
})

let db

const connectDB = async () => {
  try {
    log("info", "Attempting MySQL connection...")

    db = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      charset: "utf8mb4",
    })

    // Test connection
    await db.execute("SELECT 1")

    log("info", "MySQL connected successfully", {
      host: MYSQL_HOST,
      database: MYSQL_DATABASE,
      port: MYSQL_PORT,
    })
  } catch (error) {
    log("error", "MySQL connection failed:", {
      message: error.message,
      code: error.code,
      errno: error.errno,
    })
    process.exit(1)
  }
}

// Connect to database
connectDB()

// Routes

app.get("/health", async (req, res) => {
  let mysqlStatus = "disconnected"

  try {
    await db.execute("SELECT 1")
    mysqlStatus = "connected"
  } catch (error) {
    log("error", "Health check MySQL error:", error.message)
  }

  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mysql: mysqlStatus,
    memory: process.memoryUsage(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  }

  log("info", "Health check requested", healthData)
  res.json(healthData)
})

app.get("/api/debug", async (req, res) => {
  try {
    let mysqlStatus = "disconnected"

    try {
      await db.execute("SELECT 1")
      mysqlStatus = "connected"
    } catch (error) {
      mysqlStatus = "error"
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      mysql: {
        status: mysqlStatus,
        host: MYSQL_HOST,
        database: MYSQL_DATABASE,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        workingDirectory: process.cwd(),
      },
      kubernetes: {
        namespace: KUBERNETES_NAMESPACE,
      },
    }

    res.json(debugInfo)
  } catch (error) {
    log("error", "Debug endpoint error:", error)
    res.status(500).json({ message: "Error en debug", error: error.message })
  }
})

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body
    log("info", "Registration attempt", { email })

    // Check if user exists
    const [existingUsers] = await db.execute("SELECT id FROM users WHERE email = ?", [email])

    if (existingUsers.length > 0) {
      log("warn", "Registration failed - user exists", { email })
      return res.status(400).json({ message: "El usuario ya existe" })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // Insert new user
    const [result] = await db.execute("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword])

    log("info", "User registered successfully", { email, userId: result.insertId })
    res.status(201).json({
      message: "Usuario creado exitosamente",
      user: { id: result.insertId, email },
    })
  } catch (error) {
    log("error", "Registration error:", {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    log("info", "Login attempt", { email });

    const [users] = await db.execute("SELECT id, email, password FROM users WHERE email = ?", [email]);

    if (users.length === 0) {
      log("warn", "Login failed - user not found", { email });
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      log("warn", "Login failed - invalid password", { email });
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    log("info", "User logged in successfully", { email, userId: user.id });
    res.json({
      user: { id: user.id, email: user.email },
      message: "Login exitoso",
    });
  } catch (error) {
    log("error", "Login error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

const requireUser = (req, res, next) => {
  const userId = req.headers["x-user-id"]

  if (!userId) {
    return res.status(401).json({ message: "ID de usuario requerido" })
  }

  req.userId = Number.parseInt(userId)
  next()
}

app.get("/api/bots", requireUser, async (req, res) => {
  try {
    log("info", "Fetching bots", { userId: req.userId })

    const [bots] = await db.execute("SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC", [req.userId])

    // Parse JSON servicios field
    const botsWithParsedServices = bots.map((bot) => ({
      ...bot,
      servicios: typeof bot.servicios === "string" ? JSON.parse(bot.servicios) : bot.servicios,
    }))

    log("info", "Bots fetched successfully", { userId: req.userId, count: bots.length })
    res.json(botsWithParsedServices)
  } catch (error) {
    log("error", "Error fetching bots:", {
      userId: req.userId,
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/crear-bot", requireUser, async (req, res) => {
  try {
    const { name, token, servicios } = req.body
    log("info", "Bot creation request", {
      userId: req.userId,
      botName: name,
      services: servicios,
    })

    // Check bot limit
    const [botCount] = await db.execute("SELECT COUNT(*) as count FROM bots WHERE user_id = ?", [req.userId])

    if (botCount[0].count >= 20) {
      log("warn", "Bot creation failed - limit reached", { userId: req.userId })
      return res.status(400).json({ message: "Has alcanzado el límite máximo de 20 bots por usuario" })
    }

    // Check for existing bot name
    const [existingBots] = await db.execute("SELECT id FROM bots WHERE user_id = ? AND name = ?", [req.userId, name])

    if (existingBots.length > 0) {
      log("warn", "Bot creation failed - name exists", { userId: req.userId, botName: name })
      return res.status(400).json({ message: "Ya tienes un bot con ese nombre" })
    }

    if (!name || !token || !servicios || servicios.length === 0) {
      log("warn", "Bot creation failed - missing fields", { userId: req.userId })
      return res.status(400).json({ message: "Todos los campos son requeridos" })
    }

    // Insert new bot
    const [result] = await db.execute(
      "INSERT INTO bots (user_id, name, token, servicios, status) VALUES (?, ?, ?, ?, ?)",
      [req.userId, name, token, JSON.stringify(servicios), "creating"],
    )

    const botId = result.insertId
    log("info", "Bot record created", { userId: req.userId, botId, botName: name })

    // Get the created bot
    const [newBot] = await db.execute("SELECT * FROM bots WHERE id = ?", [botId])

    const bot = {
      ...newBot[0],
      servicios: JSON.parse(newBot[0].servicios),
    }

    createBotAsync(bot)

    res.status(201).json(bot)
  } catch (error) {
    log("error", "Bot creation error:", { userId: req.userId, message: error.message, stack: error.stack })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

async function createBotAsync(bot) {
  const workingDir = process.cwd()
  const templateDir = path.join("/app", "bot-templates")
  const botDir = path.join(workingDir, "generated-bots", bot.id.toString())

  try {
    log("info", "Starting bot deployment", { botId: bot.id, botName: bot.name })

    // 1. Limpiar directorio previo y crearlo de nuevo
    await fs.rm(botDir, { recursive: true, force: true })
    await fs.mkdir(botDir, { recursive: true })
    log("info", "Bot directory created", { botDir })

    // 2. ¡EL ARREGLO CLAVE! Copiar TODA la plantilla (archivos y carpetas) al directorio del bot.
    log("info", "Copying all template files...", { from: templateDir, to: botDir })
    await execAsync(`cp -rT ${templateDir}/. ${botDir}/`)
    log("info", "Template files copied successfully")

    // 3. Modificar el package.json en el nuevo directorio
    const packageJsonPath = path.join(botDir, "package.json")
    const packageTemplate = await fs.readFile(packageJsonPath, "utf8")
    const packageJson = JSON.parse(packageTemplate)
    packageJson.name = `bot-${bot.name.toLowerCase()}`
    packageJson.description = `Bot ${bot.name} creado con TarDía Cloud Bot Platform`
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
    log("info", "package.json customized")

    // 4. Crear el archivo .env en el nuevo directorio
    const envContent = generateBotEnvFile(bot)
    await fs.writeFile(path.join(botDir, ".env"), envContent)
    log("info", "File written", { filename: ".env" })

    // 5. Construir imagen Docker
    const imageName = `bot-${bot.name.toLowerCase()}-${bot.id}:latest`
    log("info", "Building Docker image", { imageName })
    try {
      const { stdout } = await execAsync(`docker build -t ${imageName} ${botDir}`)
      log("info", "Docker build completed", { imageName, stdout: stdout.slice(-200) })
    } catch (error) {
      log("error", "Docker build failed", { imageName, error: error.message, stderr: error.stderr })
      throw new Error(`Docker build failed: ${error.message}`)
    }

    // 6. Desplegar en Kubernetes
    const deploymentYaml = generateKubernetesDeploymentForBot(bot, imageName)
    const deploymentFile = path.join(botDir, "k8s-deployment.yaml")
    await fs.writeFile(deploymentFile, deploymentYaml)
    log("info", "Applying Kubernetes deployment", { deploymentFile })
    try {
      const { stdout } = await execAsync(`kubectl apply -f ${deploymentFile}`)
      log("info", "Kubernetes deployment applied", { stdout })
    } catch (error) {
      log("error", "Kubernetes deployment failed", { error: error.message, stderr: error.stderr })
      throw new Error(`Kubernetes deployment failed: ${error.message}`)
    }

    // 7. Esperar a que el pod esté listo
    const deploymentName = `bot-${bot.name.toLowerCase()}-${bot.id}`
    log("info", "Waiting for deployment to be ready", { deploymentName })
    await execAsync(
      `kubectl wait --for=condition=available --timeout=300s deployment/${deploymentName} -n ${KUBERNETES_NAMESPACE}`,
    )
    log("info", "Deployment is ready", { deploymentName })

    // 8. Actualizar estado del bot en la base de datos
    const serviceName = `${bot.name.toLowerCase()}-service`
    await db.execute(
      "UPDATE bots SET status = ?, url = ?, deploy_url = ?, kubernetes_deployment = ?, error_message = NULL WHERE id = ?",
      [
        "active",
        `https://t.me/${bot.name}`,
        `http://${serviceName}.${KUBERNETES_NAMESPACE}.svc.cluster.local`,
        deploymentName,
        bot.id,
      ],
    )
    log("info", "Bot deployed successfully", { botId: bot.id, botName: bot.name })
  } catch (error) {
    log("error", "Bot deployment failed", {
      botId: bot.id,
      botName: bot.name,
      error: error.message,
      stack: error.stack,
    })
    await db.execute("UPDATE bots SET status = ?, error_message = ? WHERE id = ?", ["error", error.message, bot.id])
  }
}

function generateBotEnvFile(bot) {
  // 1. Lee las claves de API desde el entorno del backend.
  //    Usa los nombres exactos con guiones que vimos con el comando `printenv`.
  const weatherKey = process.env["weather-api-key"] || ""
  const newsKey = process.env["news-api-key"] || ""
  const geminiKey = process.env["gemini-api-key"] || ""

  // 2. Genera el contenido del archivo .env para el nuevo bot.
  //    Aquí escribimos las variables en el formato estándar (mayúsculas) que el bot leerá.
  return `# Configuración del Bot ${bot.name}
BOT_NAME=${bot.name}
BOT_TOKEN=${bot.token}
SERVICES=${bot.servicios.join(",")}
PORT=3000

# APIs inyectadas por la plataforma
WEATHER_API_KEY=${weatherKey}
NEWS_API_KEY=${newsKey}
GEMINI_API_KEY=${geminiKey}
WEATHER_CITY=Buenos Aires

# Configuración de la plataforma
PLATFORM_VERSION=1.0.0
CREATED_AT=${new Date().toISOString()}
`
}

app.delete("/api/bots/:id", requireUser, async (req, res) => {
  try {
    const botId = Number.parseInt(req.params.id)
    log("info", "Bot deletion request", { userId: req.userId, botId })

    // Find bot
    const [bots] = await db.execute("SELECT * FROM bots WHERE id = ? AND user_id = ?", [botId, req.userId])

    if (bots.length === 0) {
      log("warn", "Bot deletion failed - not found", { userId: req.userId, botId })
      return res.status(404).json({ message: "Bot no encontrado" })
    }

    const bot = bots[0]
    log("info", "Deleting bot", { botId, botName: bot.name })

    // Eliminar recursos de Kubernetes
    try {
      if (bot.kubernetes_deployment) {
        const deploymentName = bot.kubernetes_deployment
        const serviceName = `${bot.name.toLowerCase()}-service`

        log("info", "Deleting Kubernetes resources", { deploymentName, serviceName })

        await execAsync(
          `kubectl delete deployment ${deploymentName} -n ${KUBERNETES_NAMESPACE} --ignore-not-found=true`,
        )

        await execAsync(`kubectl delete service ${serviceName} -n ${KUBERNETES_NAMESPACE} --ignore-not-found=true`)

        log("info", "Kubernetes resources deleted", { deploymentName, serviceName })
      }
    } catch (k8sError) {
      log("error", "Error deleting Kubernetes resources", {
        botId,
        error: k8sError.message,
      })
    }

    // Eliminar directorio del bot
    try {
      const botDir = path.join(process.cwd(), "generated-bots", botId.toString())
      await fs.rm(botDir, { recursive: true, force: true })
      log("info", "Bot directory deleted", { botDir })
    } catch (dirError) {
      log("error", "Error deleting bot directory", {
        botId,
        error: dirError.message,
      })
    }

    // Eliminar bot de la base de datos
    await db.execute("DELETE FROM bots WHERE id = ?", [botId])

    log("info", "Bot deleted successfully", { botId, botName: bot.name })
    res.json({ message: "Bot eliminado exitosamente" })
  } catch (error) {
    log("error", "Bot deletion error:", {
      userId: req.userId,
      botId: req.params.id,
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Start server
app.listen(PORT, () => {
  log("info", "Server started successfully", {
    port: PORT,
    healthEndpoint: `http://localhost:${PORT}/health`,
    kubernetesNamespace: KUBERNETES_NAMESPACE,
  })
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  log("info", "Received SIGTERM, shutting down gracefully...")
  if (db) {
    await db.end()
  }
  process.exit(0)
})

// Function to generate Kubernetes deployment YAML
function generateKubernetesDeploymentForBot(bot, imageName) {
  const deploymentName = `bot-${bot.name.toLowerCase()}-${bot.id}`

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${KUBERNETES_NAMESPACE}
  labels:
    app: ${bot.name.toLowerCase()}
    bot-id: "${bot.id}"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${bot.name.toLowerCase()}
  template:
    metadata:
      labels:
        app: ${bot.name.toLowerCase()}
        bot-id: "${bot.id}"
    spec:
      containers:
      - name: ${bot.name.toLowerCase()}
        image: ${imageName}
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
        env:
        - name: BOT_NAME
          value: "${bot.name}"
        - name: BOT_TOKEN
          value: "${bot.token}"
        - name: SERVICES
          value: "${bot.servicios.join(",")}"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${bot.name.toLowerCase()}-service
  namespace: ${KUBERNETES_NAMESPACE}
spec:
  selector:
    app: ${bot.name.toLowerCase()}
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
`
}
