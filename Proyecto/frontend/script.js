// Global state
let currentUser = null
let bots = []

// API Configuration - Configurado para desarrollo local
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3000/api"
  : "/api"

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Inicializando aplicación...")
  console.log("📡 API Base URL:", API_BASE_URL)
  console.log("🌐 Hostname:", window.location.hostname)

  initializeApp()
  setupEventListeners()
})

function initializeApp() {
  console.log("🔍 Verificando usuario guardado...")

  const savedUser = localStorage.getItem("currentUser")

  if (savedUser) {
    console.log("👤 Usuario encontrado:", savedUser)
    currentUser = JSON.parse(savedUser)
    showDashboard()
    loadBots()
  } else {
    console.log("❌ No hay usuario guardado, mostrando auth")
    showAuth()
  }
}

function setupEventListeners() {
  // Auth forms
  document.getElementById("loginForm").addEventListener("submit", handleLogin)
  document.getElementById("registerForm").addEventListener("submit", handleRegister)

  // Create bot form
  document.getElementById("createBotForm").addEventListener("submit", handleCreateBot)

  // Setup bot name validation
  setupBotNameValidation()

  // Modal close on background click
  document.getElementById("createBotModal").addEventListener("click", function (e) {
    if (e.target === this || e.target.classList.contains("modal-backdrop")) {
      closeCreateBotModal()
    }
  })

  document.getElementById("botFatherModal").addEventListener("click", function (e) {
    if (e.target === this || e.target.classList.contains("modal-backdrop")) {
      closeBotFatherInstructions()
    }
  })

  // Fixed tab switching - usar event delegation
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-btn")
    if (!tabBtn) return

    const targetTab = tabBtn.getAttribute("data-tab")
    switchTab(targetTab)
  })
}

function createSession(user) {
  localStorage.setItem("currentUser", JSON.stringify(user))
  console.log("✅ Usuario guardado:", user.email)
}

function clearSession() {
  localStorage.removeItem("currentUser")
  console.log("🧹 Sesión limpiada")
}

function setupBotNameValidation() {
  const botNameInput = document.getElementById("botName")
  const errorDiv = document.getElementById("botNameError")

  if (botNameInput) {
    botNameInput.addEventListener("input", validateBotName)
    botNameInput.addEventListener("blur", validateBotName)
  }
}

function validateBotName() {
  const botNameInput = document.getElementById("botName")
  const errorDiv = document.getElementById("botNameError")
  const value = botNameInput.value.trim()

  botNameInput.classList.remove("error", "valid")
  errorDiv.style.display = "none"

  if (!value) {
    return false
  }

  const errors = []

  if (!/^[a-zA-Z0-9-]+$/.test(value)) {
    errors.push("Solo se permiten letras, números y guiones (-)")
  }

  if (!value.toLowerCase().endsWith("bot")) {
    errors.push("Debe terminar en 'bot'")
  }

  if (value.length < 5) {
    errors.push("Debe tener al menos 5 caracteres")
  }

  if (value.length > 32) {
    errors.push("No puede tener más de 32 caracteres")
  }

  if (!/^[a-zA-Z0-9]/.test(value)) {
    errors.push("Debe empezar con una letra o número")
  }

  if (!/[a-z0-9]$/.test(value)) {
    errors.push("Debe terminar con una letra o número")
  }

  if (value.includes("--")) {
    errors.push("No puede tener guiones consecutivos")
  }

  if (value.startsWith("-") || value.endsWith("-")) {
    errors.push("No puede empezar o terminar con guión")
  }

  if (errors.length > 0) {
    botNameInput.classList.add("error")
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errors[0]}`
    errorDiv.style.display = "flex"
    return false
  } else {
    botNameInput.classList.add("valid")
    return true
  }
}

function switchTab(tab) {
  console.log("🔄 Switching to tab:", tab)

  const authForm = document.querySelector(".auth-form")

  // Remove active class from all tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"))

  // Remove active class from all tab contents
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active")
  })

  // Manejar la visibilidad de los tabs
  if (tab === "forgot") {
    // Ocultar tabs para forgot password
    authForm.classList.add("forgot-active")
  } else {
    // Mostrar tabs para login/register
    authForm.classList.remove("forgot-active")

    // Add active class to clicked tab button
    const tabButton = document.querySelector(`[data-tab="${tab}"]`)
    if (tabButton) {
      tabButton.classList.add("active")
    }
  }

  // Add active class to corresponding tab content
  const targetContent = document.querySelector(`[data-tab-content="${tab}"]`)
  if (targetContent) {
    // Small delay for smooth transition
    setTimeout(() => {
      targetContent.classList.add("active")
    }, 50)
  }
}

async function handleLogin(e) {
  e.preventDefault()
  console.log("🔐 Intentando login...")

  const email = document.getElementById("loginEmail").value
  const password = document.getElementById("loginPassword").value

  try {
    console.log("📡 Enviando request a:", `${API_BASE_URL}/auth/login`)

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    console.log("📥 Respuesta del servidor:", data)

    if (response.ok) {
      console.log("✅ Login exitoso")
      currentUser = data.user
      createSession(data.user)

      showToast("¡Bienvenido de vuelta!", "success")

      setTimeout(() => {
        console.log("🔄 Cambiando a dashboard...")
        showDashboard()
        loadBots()
      }, 1000)
    } else {
      console.log("❌ Error en login:", data.message)
      showToast(data.message || "Error al iniciar sesión", "error")
    }
  } catch (error) {
    console.error("💥 Error de conexión:", error)
    showToast(`Error de conexión: ${error.message}. Verifica que el backend esté ejecutándose.`, "error")
  }
}

async function handleRegister(e) {
  e.preventDefault()
  console.log("📝 Intentando registro...")

  const email = document.getElementById("registerEmail").value
  const password = document.getElementById("registerPassword").value

  try {
    console.log("📡 Enviando request a:", `${API_BASE_URL}/auth/register`)

    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    console.log("📥 Respuesta del servidor:", data)

    if (response.ok) {
      console.log("✅ Registro exitoso")
      currentUser = data.user
      createSession(data.user)

      showToast("¡Cuenta creada exitosamente!", "success")

      setTimeout(() => {
        showDashboard()
        loadBots()
      }, 1000)
    } else {
      console.log("❌ Error en registro:", data.message)
      showToast(data.message || "Error al crear la cuenta", "error")
    }
  } catch (error) {
    console.error("💥 Error de conexión:", error)
    showToast(`Error de conexión: ${error.message}. Verifica que el backend esté ejecutándose.`, "error")
  }
}

function logout() {
  console.log("👋 Cerrando sesión...")
  clearSession()
  currentUser = null
  bots = []
  showAuth()
  showToast("Sesión cerrada", "info")
}

function showDashboard() {
  console.log("🔄 Mostrando dashboard...")
  const authScreen = document.getElementById("authScreen")
  const dashboardScreen = document.getElementById("dashboardScreen")
  const userEmailElement = document.getElementById("userEmail")

  if (authScreen && dashboardScreen) {
    authScreen.classList.remove("active")
    authScreen.style.display = "none"
    dashboardScreen.classList.add("active")
    dashboardScreen.style.display = "block"

    if (userEmailElement && currentUser) {
      userEmailElement.textContent = `Bienvenido, ${currentUser.email}`
    }

    console.log("✅ Dashboard activado para:", currentUser?.email)
  } else {
    console.error("❌ No se encontraron las pantallas del dashboard")
  }
}

function showAuth() {
  console.log("🔄 Mostrando pantalla de autenticación")
  const authScreen = document.getElementById("authScreen")
  const dashboardScreen = document.getElementById("dashboardScreen")

  if (authScreen && dashboardScreen) {
    authScreen.classList.add("active")
    authScreen.style.display = "flex"
    dashboardScreen.classList.remove("active")
    dashboardScreen.style.display = "none"
    console.log("✅ Pantalla de auth activada")
  } else {
    console.error("❌ No se encontraron las pantallas")
  }
}

async function loadBots() {
  console.log("🤖 Cargando bots...")
  try {
    if (!currentUser) {
      console.log("❌ No hay usuario logueado")
      return
    }

    const response = await fetch(`${API_BASE_URL}/bots`, {
      headers: {
        "X-User-Id": currentUser.id.toString(),
      },
    })

    console.log("📡 Respuesta de bots:", response.status)

    if (response.ok) {
      bots = await response.json()
      console.log("🤖 Bots cargados:", bots.length)
      renderBots()
      updateStats()
    } else if (response.status === 401) {
      console.log("🔒 Usuario no autorizado, cerrando sesión")
      logout()
    } else {
      console.log("❌ Error cargando bots:", response.status)
    }
  } catch (error) {
    console.error("💥 Error loading bots:", error)
    showToast("Error de conexión al cargar bots. Verifica que el backend esté ejecutándose.", "error")
  }
}

function renderBots() {
  console.log("🎨 Renderizando bots...")
  const container = document.getElementById("botsContainer")
  const emptyState = document.getElementById("emptyState")
  const botsGrid = document.getElementById("botsGrid")

  if (!container || !emptyState || !botsGrid) {
    console.error("❌ No se encontraron elementos del DOM para bots")
    return
  }

  if (bots.length === 0) {
    console.log("📭 No hay bots, mostrando estado vacío")
    emptyState.style.display = "flex"
    botsGrid.style.display = "none"
  } else {
    console.log("🤖 Mostrando", bots.length, "bots")
    emptyState.style.display = "none"
    botsGrid.style.display = "grid"

    botsGrid.innerHTML = bots
      .map(
        (bot) => `
        <div class="bot-card">
            <div class="bot-header">
                <div>
                    <div class="bot-title">${bot.name}</div>
                    <div class="bot-date">Creado el ${new Date(bot.created_at).toLocaleDateString()}</div>
                </div>
                <div class="bot-status">
                    <div class="status-dot ${bot.status}"></div>
                    <span class="status-badge ${bot.status}">${getStatusText(bot.status)}</span>
                </div>
            </div>
            
            <div class="bot-services">
                <p>Servicios disponibles:</p>
                <div class="services-tags">
                    ${bot.servicios.map((service) => `<span class="service-tag">${getServiceName(service)}</span>`).join("")}
                </div>
            </div>
            
            <div class="bot-actions">
                ${
                  bot.status === "active" && bot.url
                    ? `
                    <button class="btn btn-primary btn-sm btn-glow" onclick="openTelegramBot('${bot.name}')">
                        <i class="fas fa-external-link-alt"></i>
                        Abrir Bot
                        <div class="btn-shine"></div>
                    </button>
                `
                    : ""
                }
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteBot('${bot._id}', '${bot.name}')">
                    <i class="fas fa-trash"></i>
                    Eliminar
                </button>
            </div>
        </div>
    `,
      )
      .join("")
  }
}

function updateStats() {
  console.log("📊 Actualizando estadísticas...")
  const totalBotsElement = document.getElementById("totalBots")
  const activeBotsElement = document.getElementById("activeBots")
  const pendingBotsElement = document.getElementById("pendingBots")
  const botLimitTextElement = document.getElementById("botLimitText")

  if (totalBotsElement) totalBotsElement.textContent = bots.length
  if (activeBotsElement) activeBotsElement.textContent = bots.filter((bot) => bot.status === "active").length
  if (pendingBotsElement) pendingBotsElement.textContent = bots.filter((bot) => bot.status === "creating").length

  if (botLimitTextElement) {
    botLimitTextElement.textContent = `(${bots.length}/20)`

    if (bots.length >= 18) {
      botLimitTextElement.style.color = "#e53e3e"
    } else if (bots.length >= 15) {
      botLimitTextElement.style.color = "#ed8936"
    } else {
      botLimitTextElement.style.color = "#718096"
    }
  }
}

function confirmDeleteBot(botId, botName) {
  if (
    confirm(
      `¿Estás seguro de que quieres eliminar el bot "${botName}"?\n\nEsta acción no se puede deshacer y eliminará todos los recursos asociados.`,
    )
  ) {
    deleteBot(botId, botName)
  }
}

async function deleteBot(botId, botName) {
  console.log(`🗑️ Eliminando bot: ${botName}`)

  try {
    showLoading(`Eliminando bot ${botName}...`)

    const response = await fetch(`${API_BASE_URL}/bots/${botId}`, {
      method: "DELETE",
      headers: {
        "X-User-Id": currentUser.id.toString(),
      },
    })

    const data = await response.json()

    if (response.ok) {
      hideLoading()
      showToast(`Bot "${botName}" eliminado exitosamente`, "success")

      bots = bots.filter((bot) => bot.id !== Number.parseInt(botId))
      renderBots()
      updateStats()
    } else {
      hideLoading()
      showToast(data.message || "Error al eliminar el bot", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

async function handleCreateBot(e) {
  e.preventDefault()
  console.log("🚀 Creando nuevo bot...")

  if (bots.length >= 20) {
    showToast("Has alcanzado el límite máximo de 20 bots", "error")
    return
  }

  const name = document.getElementById("botName").value.trim()
  const token = document.getElementById("botToken").value.trim()
  const servicios = Array.from(document.querySelectorAll('input[name="servicios"]:checked')).map((cb) => cb.value)

  if (!validateBotName()) {
    showToast("Por favor corrige el username del bot", "error")
    return
  }

  if (!validateBotToken(token)) {
    showToast("El token del bot no tiene el formato correcto", "error")
    return
  }

  if (servicios.length === 0) {
    showToast("Selecciona al menos un servicio", "error")
    return
  }

  if (bots.some((bot) => bot.name.toLowerCase() === name.toLowerCase())) {
    showToast("Ya tienes un bot con ese username", "error")
    return
  }

  showLoading("Creando tu bot...")
  closeCreateBotModal()

  try {
    const response = await fetch(`${API_BASE_URL}/crear-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": currentUser.id.toString(),
      },
      body: JSON.stringify({
        name,
        token,
        servicios,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      hideLoading()
      showToast(`¡Tu bot ${name} está siendo creado! 🎉`, "success")

      bots.unshift(data)
      renderBots()
      updateStats()

      setTimeout(() => {
        loadBots()
      }, 10000)
    } else {
      hideLoading()
      showToast(data.message || "Error al crear el bot", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

function validateBotToken(token) {
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/
  return tokenRegex.test(token)
}

function getStatusText(status) {
  const statusMap = {
    active: "Activo",
    creating: "Desplegando",
    error: "Error",
  }
  return statusMap[status] || "Desconocido"
}

function getServiceName(service) {
  const serviceMap = {
    clima: "Clima",
    noticias: "Noticias",
    chistes: "Chistes",
    ia: "Chat IA",
  }
  return serviceMap[service] || service
}

function openTelegramBot(botName) {
  window.open(`https://t.me/${botName}`, "_blank")
}

function openBotFatherInstructions() {
  console.log("🤖 Abriendo instrucciones de BotFather")
  const modal = document.getElementById("botFatherModal")
  if (modal) {
    modal.classList.add("active")
    document.body.style.overflow = "hidden"
  }
}

function closeBotFatherInstructions() {
  console.log("❌ Cerrando instrucciones de BotFather")
  const modal = document.getElementById("botFatherModal")
  if (modal) {
    modal.classList.remove("active")
    document.body.style.overflow = "auto"
  }
}

function openBotFather() {
  console.log("🚀 Abriendo BotFather en Telegram")
  window.open("https://t.me/BotFather", "_blank")
  showToast("¡Abriendo @BotFather en Telegram!", "info")
}

function copyTokenExample() {
  const tokenText = "123456789:AAAbot_token_example_here"
  navigator.clipboard
    .writeText(tokenText)
    .then(() => {
      showToast("Ejemplo de token copiado al portapapeles", "success")
    })
    .catch(() => {
      showToast("No se pudo copiar el ejemplo", "error")
    })
}

function showToast(message, type = "info") {
  console.log(`🍞 Toast: ${message} (${type})`)
  const toast = document.createElement("div")
  toast.className = `toast ${type}`

  const icon = type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"

  toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `

  const container = document.getElementById("toastContainer")
  if (container) {
    container.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 5000)
  }
}

function showLoading(message) {
  console.log(`⏳ ${message}`)
  const loadingOverlay = document.getElementById("loadingOverlay")
  const loadingText = document.getElementById("loadingText")

  if (loadingOverlay) {
    loadingOverlay.style.display = "flex"
  }
  if (loadingText) {
    loadingText.textContent = message
  }
}

function hideLoading() {
  console.log("✅ Fin de la operación")
  const loadingOverlay = document.getElementById("loadingOverlay")
  if (loadingOverlay) {
    loadingOverlay.style.display = "none"
  }
}

function closeCreateBotModal() {
  console.log("❌ Cerrando modal de creación de bot")
  const modal = document.getElementById("createBotModal")
  if (modal) {
    modal.classList.remove("active")
    document.body.style.overflow = "auto"
  }
}

function openCreateBotModal() {
  console.log("➕ Abriendo modal de creación de bot")
  const modal = document.getElementById("createBotModal")
  if (modal) {
    modal.classList.add("active")
    document.body.style.overflow = "hidden"

    // Reset form
    document.getElementById("createBotForm").reset()

    // Clear any validation errors
    const botNameInput = document.getElementById("botName")
    const errorDiv = document.getElementById("botNameError")
    if (botNameInput) {
      botNameInput.classList.remove("error", "valid")
    }
    if (errorDiv) {
      errorDiv.style.display = "none"
    }
  }
}
