package id.my.cyberpos

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.view.Gravity
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import android.content.SharedPreferences
import java.io.RandomAccessFile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Satu catatan log performa PC
data class PerfLog(
    val time: Long,
    val ramPct: Long,
    val usedMb: Long,
    val totalMb: Long,
    val uptimeSecs: Long
)

// Satu sesi OpenCode (daftar riwayat di APK, sumber server sama dgn PC)
data class OpSession(
    val id: String,
    val title: String,
    val slug: String,
    val dir: String,
    val updated: Long
)

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var pcView: ScrollView
    private lateinit var hwView: ScrollView
    private lateinit var tvDevice: TextView
    private lateinit var tvCpu: TextView
    private lateinit var tvRam: TextView
    private lateinit var tvStorage: TextView
    private lateinit var tvBattery: TextView
    // Monitor PC ini sendiri (bukan warnet)
    private lateinit var tvPcStatus: TextView
    private lateinit var tvPcStats: TextView
    private lateinit var tvLogTitle: TextView
    private lateinit var logContainer: LinearLayout
    private val navIcons = ArrayList<TextView>()
    private val navLabels = ArrayList<TextView>()
    private fun paintNav(active: Int) {
        for (i in navIcons.indices) {
            val on = i == active
            navIcons[i].setTextColor(Color.parseColor(if (on) TH_ACCENT else TH_MUTED))
            navLabels[i].setTextColor(Color.parseColor(if (on) TH_ACCENT else TH_MUTED))
        }
    }
    // Monitor PC INI (DESKTOP via LAN)
    private lateinit var pcIniView: ScrollView
    private lateinit var tvPcIniStatus: TextView
    private lateinit var tvPcIniStats: TextView
    // Tab SESI KERJA = WebView murni
    private lateinit var posView: LinearLayout
    // Riwayat sesi native di dalam tab SESI KERJA
    private lateinit var sessionPanel: LinearLayout
    private lateinit var etSessionSearch: EditText
    private lateinit var tvSessionCount: TextView
    private lateinit var sessionListBox: LinearLayout
    private lateinit var btnSessToggle: Button
    private lateinit var sessTitleRow: LinearLayout
    private val opSessions = ArrayList<OpSession>()
    private lateinit var prefs: SharedPreferences
    private var authTried: Boolean = false
    private val dateFmt = SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault())
    // SESI KERJA = OpenCode, jangan diganggu
    private val BASE = "https://opencode.cyberpos.my.id"
    // MONITOR SERVER = backend di server Ubuntu (publik)
    private val API_BASE = "https://cyberpos.my.id"
    // MONITOR PC INI = DESKTOP (publik dulu, fallback WiFi LAN)
    private val API_PC0 = "https://pcmu.cyberpos.my.id"
    private val API_PC1 = "http://192.168.1.16:8002"
    private val API_PC2 = "http://192.168.0.100:8002"

    // 0 = OpenCode, 1 = Server, 2 = Hardware HP, 3 = PC ini
    private var mode = 0
    private val perfLog = ArrayList<PerfLog>()
    private var lastPcRamPct = -1L

    // Tema Cyber Code: navy gelap + teal (sesuai desain)
    private val TH_BG = "#0A141F"
    private val TH_CARD = "#101D2C"
    private val TH_CARD2 = "#16273A"
    private val TH_ACCENT = "#2DD4BF"
    private val TH_TEXT = "#F1F5F9"
    private val TH_MUTED = "#7D8CA3"
    private fun cardBg(): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.RECTANGLE
            cornerRadius = 24f
            setColor(Color.parseColor(TH_CARD))
            setStroke(2, Color.parseColor(TH_ACCENT))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var batteryLevel = -1
    private var batteryTemp = -1
    private var batteryStatus = "Unknown"
    private var tickCount = 0

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            intent ?: return
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            batteryLevel = if (level >= 0 && scale > 0) (level * 100 / scale) else level
            batteryTemp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            batteryStatus = when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                BatteryManager.BATTERY_STATUS_FULL -> "Full"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not charging"
                else -> "Unknown"
            }
        }
    }

    // Ticker 1 detik: server + PC ini refresh tiap 5 detik, hardware HP tiap 2 detik
    private val ticker = object : Runnable {
        override fun run() {
            tickCount++
            if (mode == 1 && tickCount % 5 == 0) fetchPcSys(autoLog = tickCount % 30 == 0)
            if (mode == 3 && tickCount % 5 == 0) fetchPcIni()
            if (mode == 2 && tickCount % 2 == 0) refreshHardware()
            handler.postDelayed(this, 1000)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("cyberpos_pc", Context.MODE_PRIVATE)
        loadLog()

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(TH_BG))
        }

        // ===== HEADER ala desain: logo + Cyber Code + gear =====
        val headerBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(16, 12, 16, 12)
            setBackgroundColor(Color.parseColor(TH_BG))
            gravity = Gravity.CENTER_VERTICAL
        }
        val logoTv = TextView(this).apply {
            text = "◉"
            textSize = 24f
            setTextColor(Color.parseColor(TH_ACCENT))
            setPadding(0, 0, 8, 0)
        }
        val appTitle = TextView(this).apply {
            text = "Cyber Code"
            textSize = 19f
            setTextColor(Color.parseColor(TH_TEXT))
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        val gearSpace = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        val gearBtn = Button(this).apply {
            text = "⚙"
            textSize = 20f
            setBackgroundColor(Color.TRANSPARENT)
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        gearBtn.setOnClickListener { refreshCurrent() }
        headerBar.addView(logoTv)
        headerBar.addView(appTitle)
        headerBar.addView(gearSpace)
        headerBar.addView(gearBtn)
        layout.addView(headerBar, LinearLayout.LayoutParams(-1, -2))

        // ===== KONTEN (diisi tab di bawah, lalu bottom nav) =====
        val contentWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(TH_BG))
        }

        // ===== TAB SESI KERJA: riwayat native + WebView OpenCode =====
        posView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(TH_BG))
        }

        // --- header riwayat native ---
        sessTitleRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor(TH_BG))
        }
        val sessTitle = TextView(this).apply {
            text = "RIWAYAT KERJA"
            textSize = 16f
            setTextColor(Color.parseColor(TH_ACCENT))
            setPadding(4, 8, 4, 8)
        }
        val btnSessRefresh = Button(this).apply {
            text = "⟳"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnSessRefresh.setOnClickListener { fetchOpSessions() }
        btnSessToggle = Button(this).apply {
            text = "SEMBUNYIKAN"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        sessTitleRow.addView(sessTitle, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        sessTitleRow.addView(btnSessRefresh, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        sessTitleRow.addView(btnSessToggle, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        posView.addView(sessTitleRow, LinearLayout.LayoutParams(-1, -2))

        // WebView OpenCode (sama persis kayak di PC)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true) {
                        Toast.makeText(this@MainActivity, "Web error: ${error?.description}", Toast.LENGTH_LONG).show()
                    }
                }
                override fun onReceivedHttpAuthRequest(view: WebView?, handler: HttpAuthHandler?, host: String?, realm: String?) {
                    if (handler == null) return
                    // coba kredensial tersimpan sekali; kalau gagal, tampilkan dialog
                    if (!authTried) {
                        authTried = true
                        val u = prefs.getString("oc_user", "opencode") ?: "opencode"
                        val p = prefs.getString("oc_pass", "") ?: ""
                        if (p.isNotEmpty()) {
                            handler.proceed(u, p)
                            return
                        }
                    }
                    showOcLogin { u, p ->
                        prefs.edit().putString("oc_user", u).putString("oc_pass", p).apply()
                        handler.proceed(u, p)
                    }
                }
                override fun onPageFinished(view: WebView?, url: String?) {
                    authTried = false
                }
            }
            webChromeClient = WebChromeClient()
        }

        // --- body riwayat: cari + daftar ---
        sessionPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(8, 8, 8, 8)
            background = cardBg()
        }
        etSessionSearch = EditText(this).apply {
            hint = "Cari riwayat kerja..."
            textSize = 14f
            isSingleLine = true
            setTextColor(Color.parseColor(TH_TEXT))
            setHintTextColor(Color.parseColor(TH_MUTED))
            setBackgroundColor(Color.parseColor(TH_CARD2))
        }
        tvSessionCount = TextView(this).apply {
            textSize = 12f; setPadding(4, 2, 4, 2)
            setTextColor(Color.parseColor(TH_MUTED))
        }
        val sessionScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, 420)
        }
        sessionListBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(4, 4, 4, 4)
        }
        sessionScroll.addView(sessionListBox)
        sessionPanel.addView(etSessionSearch)
        sessionPanel.addView(tvSessionCount)
        sessionPanel.addView(sessionScroll)
        etSessionSearch.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) { renderSessionList() }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        btnSessToggle.setOnClickListener {
            if (sessionPanel.visibility == View.VISIBLE) {
                sessionPanel.visibility = View.GONE
                btnSessToggle.text = "TAMPILKAN"
            } else {
                sessionPanel.visibility = View.VISIBLE
                btnSessToggle.text = "SEMBUNYIKAN"
                if (opSessions.isEmpty()) fetchOpSessions() else renderSessionList()
            }
        }
        posView.addView(sessionPanel, LinearLayout.LayoutParams(-1, -2))
        posView.addView(web, LinearLayout.LayoutParams(-1, -1, 1f))

        // ===== MONITOR PC INI SENDIRI =====
        pcView = ScrollView(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor(TH_BG))
        }
        val pcInner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)
            background = cardBg()
        }
        val pcTitle = TextView(this).apply {
            text = "CYBER SERVER"
            textSize = 20f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 8)
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        tvPcStatus = TextView(this).apply {
            textSize = 14f; setPadding(0, 0, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvPcStats = TextView(this).apply {
            textSize = 14f; setPadding(12, 12, 12, 12)
            setTextColor(Color.parseColor(TH_TEXT))
            setBackgroundColor(Color.parseColor(TH_CARD))
        }
        val btnRefreshPc = Button(this).apply {
            text = "REFRESH SEKARANG"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnRefreshPc.setOnClickListener { fetchPcSys(autoLog = false) }
        val btnSaveLog = Button(this).apply {
            text = "SIMPAN LOG SEKARANG"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnSaveLog.setOnClickListener { fetchPcSys(autoLog = true) }
        tvLogTitle = TextView(this).apply {
            text = "LOG PERFORMA (0)"
            textSize = 17f
            setPadding(0, 16, 0, 8)
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        val btnClearLog = Button(this).apply {
            text = "HAPUS LOG"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnClearLog.setOnClickListener {
            perfLog.clear()
            saveLog()
            refreshLogUI()
            Thread { httpPost("/api/sys/clear", "{}") }.start()
            Toast.makeText(this, "Log dihapus (HP + PC)", Toast.LENGTH_SHORT).show()
        }
        logContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 8, 0, 8)
            setBackgroundColor(Color.parseColor(TH_BG))
        }
        pcInner.addView(pcTitle)
        pcInner.addView(tvPcStatus)
        pcInner.addView(tvPcStats)
        pcInner.addView(btnRefreshPc)
        pcInner.addView(btnSaveLog)
        pcInner.addView(tvLogTitle)
        pcInner.addView(btnClearLog)
        pcInner.addView(logContainer)
        pcView.addView(pcInner)

        // ===== MONITOR PC INI (DESKTOP via WiFi LAN) =====
        pcIniView = ScrollView(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor(TH_BG))
        }
        val pcIniInner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)
            background = cardBg()
        }
        val pcIniTitle = TextView(this).apply {
            text = "CYBER PC"
            textSize = 20f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 8)
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        tvPcIniStatus = TextView(this).apply {
            textSize = 14f; setPadding(0, 0, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvPcIniStats = TextView(this).apply {
            textSize = 14f; setPadding(12, 12, 12, 12)
            setTextColor(Color.parseColor(TH_TEXT))
            setBackgroundColor(Color.parseColor(TH_CARD))
        }
        val btnRefreshPcIni = Button(this).apply {
            text = "REFRESH SEKARANG"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnRefreshPcIni.setOnClickListener { fetchPcIni() }
        pcIniInner.addView(pcIniTitle)
        pcIniInner.addView(tvPcIniStatus)
        pcIniInner.addView(tvPcIniStats)
        pcIniInner.addView(btnRefreshPcIni)
        pcIniView.addView(pcIniInner)

        // ===== HARDWARE HP =====
        hwView = ScrollView(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor(TH_BG))
        }
        val hwInner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            background = cardBg()
        }
        val hwTitle = TextView(this).apply {
            text = "CYBER DEVICE"
            textSize = 20f
            setPadding(0, 0, 0, 16)
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        tvDevice = TextView(this).apply {
            textSize = 15f; setPadding(0, 8, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvCpu = TextView(this).apply {
            textSize = 15f; setPadding(0, 8, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvRam = TextView(this).apply {
            textSize = 15f; setPadding(0, 8, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvStorage = TextView(this).apply {
            textSize = 15f; setPadding(0, 8, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        tvBattery = TextView(this).apply {
            textSize = 15f; setPadding(0, 8, 0, 8)
            setTextColor(Color.parseColor(TH_TEXT))
        }
        val btnRefresh = Button(this).apply {
            text = "REFRESH SEKARANG"
            setBackgroundColor(Color.parseColor(TH_CARD2))
            setTextColor(Color.parseColor(TH_ACCENT))
        }
        btnRefresh.setOnClickListener { refreshHardware() }
        hwInner.addView(hwTitle)
        hwInner.addView(tvDevice)
        hwInner.addView(tvCpu)
        hwInner.addView(tvRam)
        hwInner.addView(tvStorage)
        hwInner.addView(tvBattery)
        hwInner.addView(btnRefresh)
        hwView.addView(hwInner)

        contentWrap.addView(posView, LinearLayout.LayoutParams(-1, -1, 1f))
        contentWrap.addView(pcView, LinearLayout.LayoutParams(-1, -1, 1f))
        contentWrap.addView(pcIniView, LinearLayout.LayoutParams(-1, -1, 1f))
        contentWrap.addView(hwView, LinearLayout.LayoutParams(-1, -1, 1f))
        layout.addView(contentWrap, LinearLayout.LayoutParams(-1, -1, 1f))

        // ===== BOTTOM NAV ala desain =====
        val navDivider = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, 3)
            setBackgroundColor(Color.parseColor(TH_CARD2))
        }
        layout.addView(navDivider)
        val bottomNav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor(TH_BG))
            setPadding(4, 6, 4, 10)
        }
        fun navItem(icon: String, label: String, onTap: () -> Unit): LinearLayout {
            val box = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(2, 2, 2, 2)
                isClickable = true
                isFocusable = true
            }
            val iv = TextView(this).apply {
                text = icon
                textSize = 22f
                gravity = Gravity.CENTER
            }
            val lb = TextView(this).apply {
                text = label
                textSize = 11f
                gravity = Gravity.CENTER
            }
            box.addView(iv)
            box.addView(lb)
            box.setOnClickListener { onTap() }
            navIcons.add(iv)
            navLabels.add(lb)
            return box
        }
        val navLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        bottomNav.addView(navItem("◷", "Sesi Kerja") { showPos() }, navLp)
        bottomNav.addView(navItem("💻", "Cyber PC") { showPcIni() }, navLp)
        bottomNav.addView(navItem("🗄", "Cyber Server") { showPc() }, navLp)
        bottomNav.addView(navItem("📱", "Cyber Device") { showHw() }, navLp)
        layout.addView(bottomNav, LinearLayout.LayoutParams(-1, -2))
        setContentView(layout)

        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        handler.post(ticker)
        web.loadUrl(BASE)
        refreshLogUI()
        fetchOpSessions()
        paintNav(0)
    }

    private fun showPos() {
        mode = 0
        paintNav(0)
        pcView.visibility = View.GONE
        pcIniView.visibility = View.GONE
        hwView.visibility = View.GONE
        posView.visibility = View.VISIBLE
        // muat ulang kalau WebView kosong atau nyangkut di jebakan JSON API
        val u = web.url
        if (u == null || (u.startsWith(BASE + "/session/") && !u.contains("/server/"))) web.loadUrl(BASE)
    }

    private fun showPc() {
        mode = 1
        paintNav(2)
        posView.visibility = View.GONE
        pcIniView.visibility = View.GONE
        hwView.visibility = View.GONE
        pcView.visibility = View.VISIBLE
        fetchPcSys(autoLog = false)
        fetchSysHistory()
    }

    private fun showPcIni() {
        mode = 3
        paintNav(1)
        posView.visibility = View.GONE
        pcView.visibility = View.GONE
        hwView.visibility = View.GONE
        pcIniView.visibility = View.VISIBLE
        fetchPcIni()
    }

    private fun showHw() {
        mode = 2
        paintNav(3)
        posView.visibility = View.GONE
        pcView.visibility = View.GONE
        pcIniView.visibility = View.GONE
        hwView.visibility = View.VISIBLE
        refreshHardware()
    }

    private fun refreshCurrent() {
        when (mode) {
            0 -> fetchOpSessions()
            1 -> { fetchPcSys(autoLog = false); fetchSysHistory() }
            3 -> fetchPcIni()
            else -> refreshHardware()
        }
    }

    // ---- MONITOR PC INI (DESKTOP via WiFi, tanpa log) ----
    private fun httpGetPc(path: String): Pair<String, String?> {
        for (base in arrayOf(API_PC0, API_PC1, API_PC2)) {
            try {
                val url = java.net.URL(base + path)
                val c = url.openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 4000; c.readTimeout = 4000
                c.requestMethod = "GET"
                if (c.responseCode == 200) {
                    val body = c.inputStream.bufferedReader().use { it.readText() }
                    return Pair(base, body)
                }
            } catch (_: Exception) {}
        }
        return Pair("", null)
    }

    private fun fetchPcIni() {
        // tampilkan cache dulu biar tidak blank "menyambungkan"
        val cached = prefs.getString("pcini_stats", "")
        val cachedTime = prefs.getLong("pcini_time", 0L)
        if (!cached.isNullOrEmpty()) {
            tvPcIniStatus.text = "Status: memuat ulang... (data terakhir ${dateFmt.format(Date(cachedTime))})"
            tvPcIniStats.text = cached
        } else {
            tvPcIniStatus.text = "Menghubungkan ke DESKTOP..."
        }
        Thread {
            val (base, resp) = httpGetPc("/api/sys")
            if (resp == null) {
                handler.post {
                    tvPcIniStatus.text = if (!cached.isNullOrEmpty())
                        "Status: OFFLINE — data terakhir ${dateFmt.format(Date(cachedTime))}"
                    else "Status: OFFLINE (butuh internet / satu WiFi dengan PC)"
                }
                return@Thread
            }
            try {
                val o = org.json.JSONObject(resp)
                val hostname = o.optString("hostname", "-")
                val platform = o.optString("platform", "-")
                val arch = o.optString("arch", "-")
                val release = o.optString("release", "")
                val cpuModel = o.optString("cpuModel", "-")
                val cpuCount = o.optInt("cpuCount", 0)
                val cpuSpeed = o.optInt("cpuSpeed", 0)
                val totalMb = o.optLong("totalMb", 0)
                val usedMb = o.optLong("usedMb", 0)
                val ramPct = o.optLong("ramPct", 0)
                val uptimeSecs = o.optLong("uptimeSecs", 0)
                val load1 = o.optDouble("load1", 0.0)
                val diskTotal = if (o.isNull("diskTotalGb")) null else o.optDouble("diskTotalGb", 0.0)
                val diskFree = if (o.isNull("diskFreeGb")) null else o.optDouble("diskFreeGb", 0.0)
                handler.post {
                    tvPcIniStatus.text = "Status: ONLINE • $hostname • via $base • ${dateFmt.format(Date())}"
                    val sb = StringBuilder()
                    sb.append("Host: $hostname\n")
                    sb.append("OS: $platform $arch ($release)\n")
                    sb.append("CPU: $cpuModel x$cpuCount @ ${cpuSpeed}MHz\n")
                    sb.append("Load: $load1\n")
                    sb.append("RAM: $usedMb / $totalMb MB (${ramPct}%)\n")
                    sb.append("Uptime: ${fmtDuration(uptimeSecs)}")
                    if (diskTotal != null) sb.append("\nDisk free: $diskFree / $diskTotal GB")
                    tvPcIniStats.text = sb.toString()
                    prefs.edit().putString("pcini_stats", sb.toString())
                        .putLong("pcini_time", System.currentTimeMillis()).apply()
                }
            } catch (_: Exception) {}
        }.start()
    }

    // ---- RIWAYAT SESI OPENCODE (daftar + baca isi, native) ----
    private fun showOcLogin(onOk: (String, String) -> Unit) {
        val lay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 16, 32, 0)
        }
        val etU = android.widget.EditText(this).apply {
            hint = "Username"
            setText(prefs.getString("oc_user", "opencode") ?: "opencode")
        }
        val etP = android.widget.EditText(this).apply {
            hint = "Password"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        lay.addView(etU)
        lay.addView(etP)
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Login OpenCode")
            .setMessage("Server butuh login (sama kayak di browser).")
            .setView(lay)
            .setPositiveButton("MASUK") { _, _ ->
                onOk(etU.text.toString().trim(), etP.text.toString())
            }
            .setNegativeButton("BATAL", null)
            .show()
    }

    private fun opAuth(): String? {
        val u = prefs.getString("oc_user", "opencode") ?: "opencode"
        val p = prefs.getString("oc_pass", "") ?: ""
        if (p.isEmpty()) return null
        val raw = (u + ":" + p).toByteArray(Charsets.UTF_8)
        return "Basic " + android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP)
    }

    private fun httpGetOp(path: String): String? {
        return try {
            val url = java.net.URL(BASE + path)
            val c = url.openConnection() as java.net.HttpURLConnection
            c.connectTimeout = 8000; c.readTimeout = 15000
            c.requestMethod = "GET"
            opAuth()?.let { c.setRequestProperty("Authorization", it) }
            if (c.responseCode == 401) return "NEED_LOGIN"
            if (c.responseCode != 200) return null
            c.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) { null }
    }

    private fun fetchOpSessions() {
        tvSessionCount.text = "Memuat riwayat..."
        Thread {
            val resp = httpGetOp("/session")
            if (resp == null) {
                handler.post { tvSessionCount.text = "Offline — cek koneksi ke server" }
                return@Thread
            }
            if (resp == "NEED_LOGIN") {
                handler.post { tvSessionCount.text = "Belum login — buka tab SESI KERJA, login dulu, lalu refresh ⟳" }
                return@Thread
            }
            try {
                val arr = try {
                    org.json.JSONArray(resp)
                } catch (_: Exception) {
                    org.json.JSONObject(resp).getJSONArray("value")
                }
                val list = ArrayList<OpSession>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val t = o.optJSONObject("time")
                    list.add(
                        OpSession(
                            id = o.optString("id", ""),
                            title = o.optString("title", "").ifEmpty { o.optString("slug", "-") },
                            slug = o.optString("slug", ""),
                            dir = o.optString("directory", o.optString("path", "")),
                            updated = t?.optLong("updated", 0L) ?: 0L
                        )
                    )
                }
                list.sortByDescending { it.updated }
                handler.post {
                    opSessions.clear()
                    opSessions.addAll(list)
                    renderSessionList()
                }
            } catch (_: Exception) {
                handler.post { tvSessionCount.text = "Gagal baca riwayat" }
            }
        }.start()
    }

    private fun renderSessionList() {
        if (!::sessionListBox.isInitialized) return
        val q = etSessionSearch.text.toString().trim().lowercase()
        val filtered = (if (q.isEmpty()) opSessions.toList()
            else opSessions.filter {
                it.title.lowercase().contains(q) || it.slug.lowercase().contains(q) ||
                it.dir.lowercase().contains(q) || it.id.lowercase().contains(q)
            }).take(50)
        tvSessionCount.text = "Riwayat kerja: ${filtered.size}/${opSessions.size}" +
            if (q.isNotEmpty()) " (cari: $q)" else " — tap untuk buka"
        sessionListBox.removeAllViews()
        if (filtered.isEmpty()) {
            sessionListBox.addView(TextView(this).apply {
                text = if (q.isEmpty()) "Belum ada riwayat." else "Tidak ketemu \"$q\""
                textSize = 13f; setPadding(8, 8, 8, 8)
            })
            return
        }
        for (s in filtered) {
            val tv = TextView(this).apply {
                text = "• ${s.title}\n  ${s.dir} • ${dateFmt.format(Date(if (s.updated > 0) s.updated else System.currentTimeMillis()))}"
                textSize = 13f
                setTextColor(Color.parseColor(TH_TEXT))
                setPadding(12, 10, 12, 10)
                isClickable = true
                isFocusable = true
                setBackgroundColor(Color.parseColor(TH_CARD))
            }
            tv.setOnClickListener { openSessionChat(s) }
            sessionListBox.addView(tv)
            sessionListBox.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(-1, 4)
            })
        }
    }

    private fun openSessionChat(s: OpSession) {
        // buka di web seperti sesi baru: /server/{base64url}/session/{id}
        // daftar disembunyikan biar tidak numpuk, header + toggle tetap ada
        sessionPanel.visibility = View.GONE
        btnSessToggle.text = "TAMPILKAN"
        val key = android.util.Base64.encodeToString(
            BASE.toByteArray(Charsets.UTF_8),
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP
        ).trimEnd('=')
        web.loadUrl(BASE + "/server/" + key + "/session/" + s.id)
        Toast.makeText(this, "Buka: ${s.title}", Toast.LENGTH_SHORT).show()
    }

    // ---- MONITOR SERVER via /api/sys ----
    private fun httpGet(path: String): String? {
        return try {
            val url = java.net.URL(API_BASE + path)
            val c = url.openConnection() as java.net.HttpURLConnection
            c.connectTimeout = 6000; c.readTimeout = 6000
            c.requestMethod = "GET"
            if (c.responseCode != 200) return null
            c.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) { null }
    }

    private fun httpPost(path: String, json: String): String? {
        return try {
            val url = java.net.URL(API_BASE + path)
            val c = url.openConnection() as java.net.HttpURLConnection
            c.connectTimeout = 6000; c.readTimeout = 6000
            c.requestMethod = "POST"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(json.toByteArray()) }
            if (c.responseCode !in 200..299) return null
            c.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) { null }
    }

    private fun fetchPcSys(autoLog: Boolean) {
        Thread {
            val resp = httpGet("/api/sys")
            if (resp == null) {
                handler.post { tvPcStatus.text = "Status: OFFLINE (tidak bisa ke $API_BASE)" }
                return@Thread
            }
            try {
                val o = org.json.JSONObject(resp)
                val hostname = o.optString("hostname", "-")
                val platform = o.optString("platform", "-")
                val arch = o.optString("arch", "-")
                val release = o.optString("release", "")
                val cpuModel = o.optString("cpuModel", "-")
                val cpuCount = o.optInt("cpuCount", 0)
                val cpuSpeed = o.optInt("cpuSpeed", 0)
                val totalMb = o.optLong("totalMb", 0)
                val usedMb = o.optLong("usedMb", 0)
                val ramPct = o.optLong("ramPct", 0)
                val uptimeSecs = o.optLong("uptimeSecs", 0)
                val load1 = o.optDouble("load1", 0.0)
                val diskTotal = if (o.isNull("diskTotalGb")) null else o.optDouble("diskTotalGb", 0.0)
                val diskFree = if (o.isNull("diskFreeGb")) null else o.optDouble("diskFreeGb", 0.0)
                val sv = o.optJSONObject("services")
                val svcBackend = sv?.optString("backend", "-") ?: "-"
                val svcOpencode = sv?.optString("opencode", "-") ?: "-"
                val svcTunnel = sv?.optString("tunnel", "-") ?: "-"
                val pos8000 = o.optString("pos8000", "-")
                val sessionCount = o.optLong("sessionCount", -1L)
                lastPcRamPct = ramPct
                handler.post {
                    tvPcStatus.text = "Status: ONLINE • $hostname • ${dateFmt.format(Date())}"
                    val sb = StringBuilder()
                    sb.append("Host: $hostname\n")
                    sb.append("OS: $platform $arch ($release)\n")
                    sb.append("CPU: $cpuModel x$cpuCount @ ${cpuSpeed}MHz\n")
                    sb.append("Load: $load1\n")
                    sb.append("RAM: $usedMb / $totalMb MB (${ramPct}%)\n")
                    sb.append("Uptime: ${fmtDuration(uptimeSecs)}")
                    if (diskTotal != null) sb.append("\nDisk free: $diskFree / $diskTotal GB")
                    sb.append("\nService backend: $svcBackend • opencode: $svcOpencode • tunnel: $svcTunnel")
                    sb.append("\nPOS(8000): $pos8000 • Sesi OpenCode: " + if (sessionCount >= 0) "$sessionCount" else "-")
                    tvPcStats.text = sb.toString()
                    if (autoLog) {
                        addLog(PerfLog(System.currentTimeMillis(), ramPct, usedMb, totalMb, uptimeSecs))
                        Thread { httpPost("/api/sys/log", "{}") }.start()
                    }
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun fetchSysHistory() {
        Thread {
            val resp = httpGet("/api/sys/history") ?: return@Thread
            try {
                val arr = org.json.JSONObject(resp).getJSONArray("history")
                val list = ArrayList<PerfLog>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    list.add(
                        PerfLog(
                            o.optLong("time", 0L),
                            o.optLong("ramPct", 0L),
                            o.optLong("usedMb", 0L),
                            o.optLong("totalMb", 0L),
                            o.optLong("uptimeSecs", 0L)
                        )
                    )
                }
                handler.post {
                    // gabung server + lokal, urut terbaru, max 100
                    val seen = list.map { it.time }.toSet()
                    for (l in perfLog.toList()) {
                        if (list.size >= 100) break
                        if (l.time !in seen) list.add(l)
                    }
                    perfLog.clear()
                    perfLog.addAll(list.sortedByDescending { it.time }.take(100))
                    saveLog()
                    refreshLogUI()
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun addLog(log: PerfLog) {
        perfLog.add(0, log)
        while (perfLog.size > 100) perfLog.removeAt(perfLog.size - 1)
        saveLog()
        refreshLogUI()
    }

    private fun saveLog() {
        val sb = StringBuilder()
        for ((idx, l) in perfLog.withIndex()) {
            if (idx > 0) sb.append("\n")
            sb.append("${l.time}|${l.ramPct}|${l.usedMb}|${l.totalMb}|${l.uptimeSecs}")
        }
        prefs.edit().putString("pc_log", sb.toString()).apply()
    }

    private fun loadLog() {
        perfLog.clear()
        val raw = prefs.getString("pc_log", "") ?: ""
        if (raw.isEmpty()) return
        for (line in raw.split("\n")) {
            if (line.isEmpty()) continue
            val p = line.split("|")
            if (p.size != 5) continue
            try {
                perfLog.add(PerfLog(p[0].toLong(), p[1].toLong(), p[2].toLong(), p[3].toLong(), p[4].toLong()))
            } catch (_: Exception) {}
        }
    }

    private fun refreshLogUI() {
        if (!::logContainer.isInitialized) return
        tvLogTitle.text = "LOG PERFORMA (${perfLog.size})"
        logContainer.removeAllViews()
        if (perfLog.isEmpty()) {
            logContainer.addView(TextView(this).apply {
                text = "Belum ada log. Otomatis dicatat tiap 30 detik saat tab ini dibuka, atau tekan SIMPAN LOG."
                textSize = 13f
                setPadding(0, 4, 0, 4)
                setTextColor(Color.parseColor(TH_MUTED))
            })
            return
        }
        for (l in perfLog) {
            logContainer.addView(TextView(this).apply {
                text = "${dateFmt.format(Date(l.time))}\nRAM ${l.usedMb}/${l.totalMb} MB (${l.ramPct}%) • Up ${fmtDuration(l.uptimeSecs)}"
                textSize = 13f
                setPadding(12, 8, 12, 8)
                setTextColor(Color.parseColor(TH_TEXT))
                setBackgroundColor(Color.parseColor(TH_CARD))
            })
            logContainer.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(-1, 2).apply { setMargins(0, 4, 0, 4) }
                setBackgroundColor(Color.parseColor("#334155"))
            })
        }
    }

    private fun fmtDuration(secs: Long): String {
        val d = secs / 86400
        val h = (secs % 86400) / 3600
        val m = (secs % 3600) / 60
        val s = secs % 60
        return if (d > 0) "${d}h %02d:%02d:%02d".format(h, m, s) else "%02d:%02d:%02d".format(h, m, s)
    }

    // ---- HARDWARE HP ----
    private fun refreshHardware() {
        tvDevice.text = "DEVICE\nModel: ${Build.MANUFACTURER} ${Build.MODEL}\n" +
            "Android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})\n" +
            "Board: ${Build.BOARD} | CPU ABI: ${Build.SUPPORTED_ABIS.firstOrNull() ?: "-"}"

        val cores = Runtime.getRuntime().availableProcessors()
        val cpuUsage = readCpuUsage()
        val freq = readCpuFreq()
        tvCpu.text = "CPU\nCores: $cores\nUsage: $cpuUsage\nFreq: $freq"

        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memInfo)
        val totalMb = memInfo.totalMem / (1024 * 1024)
        val availMb = memInfo.availMem / (1024 * 1024)
        val usedMb = totalMb - availMb
        val usedPct = if (totalMb > 0) (usedMb * 100 / totalMb) else 0
        tvRam.text = "RAM\nTotal: ${totalMb} MB\nTerpakai: ${usedMb} MB (${usedPct}%)\nTersedia: ${availMb} MB\nLowMemory: ${memInfo.lowMemory}"

        val stat = StatFs(Environment.getDataDirectory().path)
        val blockSize = stat.blockSizeLong
        val totalBlocks = stat.blockCountLong
        val availBlocks = stat.availableBlocksLong
        val totalGb = totalBlocks * blockSize / (1024.0 * 1024.0 * 1024.0)
        val freeGb = availBlocks * blockSize / (1024.0 * 1024.0 * 1024.0)
        tvStorage.text = "STORAGE (Internal)\nTotal: ${"%.2f".format(totalGb)} GB\nKosong: ${"%.2f".format(freeGb)} GB\nTerpakai: ${"%.2f".format(totalGb - freeGb)} GB"

        val tempC = if (batteryTemp >= 0) (batteryTemp / 10.0).toString() + " C" else "-"
        tvBattery.text = "BATERAI\nLevel: ${batteryLevel}%\nStatus: $batteryStatus\nSuhu: $tempC"
    }

    private var lastIdle: Long = 0
    private var lastTotal: Long = 0
    private fun readCpuUsage(): String {
        return try {
            val reader = RandomAccessFile("/proc/stat", "r")
            val line = reader.readLine()
            reader.close()
            val parts = line.trim().split("\\s+".toRegex())
            val idle = parts[4].toLong() + parts[5].toLong()
            var total = 0L
            for (i in 1 until parts.size) total += parts[i].toLongOrNull() ?: 0L
            val result = if (lastTotal != 0L) {
                val dIdle = idle - lastIdle
                val dTotal = total - lastTotal
                if (dTotal > 0) "${((dTotal - dIdle) * 100 / dTotal)}%" else "-"
            } else "..."
            lastIdle = idle
            lastTotal = total
            result
        } catch (e: Exception) { "-" }
    }

    private fun readCpuFreq(): String {
        return try {
            val reader = RandomAccessFile("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", "r")
            val khz = reader.readLine()?.trim()?.toLongOrNull()
            reader.close()
            if (khz != null) "${khz / 1000} MHz" else "-"
        } catch (e: Exception) { "-" }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(batteryReceiver) } catch (_: Exception) {}
        handler.removeCallbacks(ticker)
    }
}
