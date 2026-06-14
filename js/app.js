/* ==========================================================================
   AURA SESSION GUARD
   ========================================================================== */
const currentUser = localStorage.getItem("AURA_USER");
if (!currentUser) {
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem("AURA_USER");
  window.location.href = "index.html";
}

/* ==========================================================================
   AURA DATA ENGINE & SEED DATA (Rachel & Kevin Wedding Planner)
   ========================================================================== */
const DEFAULT_VENDORS = [
  {
    vendor_id: "VND-VEN-001",
    category: "Venue",
    vendor_name: "Aula Badarusamsi (Ditkuad)",
    package_name: "Sewa Sesi Pagi (Selected)",
    price: 8650000,
    notes: "Luas 24x12 Meter (288 m²). Ukuran Pelaminan 7x9m. Listrik Bebas / Free Genset. AC Charge Rp 150.000. Waktu: Pukul 06.00 s.d 14.00 WIB. Pilihan praktis dan paling hemat.",
    status: "Selected"
  },
  {
    vendor_id: "VND-VEN-002",
    category: "Venue",
    vendor_name: "Aula LPTQ Jawa Barat",
    package_name: "Gedung Kosong Pagi (Draft)",
    price: 5500000,
    notes: "Luas 400 m². Ukuran Pelaminan 9.5m. Listrik 5.000 Watt (Wajib sewa Genset luar). Pendingin AC bawaan hanya 6 unit 1/2 PK (Kurang dingin, wajib sewa Standing AC). Sesi s.d Pukul 14.00 WIB.",
    status: "Draft"
  },
  {
    vendor_id: "VND-CAT-001",
    category: "Catering",
    vendor_name: "Komala Catering (Lembang)",
    package_name: "Platinum Package 1 (Selected)",
    price: 33500000,
    notes: "Harga spesial untuk 1.000 Pax. Prasmanan utama 100%, 3 Gubukan (60%), 3 Dessert (60%), 2 Drink (60%). Free Nasi Punar & Ayam Bakakak tradisi Huap Lingkup. Dekorasi Area Makan simple.",
    status: "Selected"
  },
  {
    vendor_id: "VND-DEC-001",
    category: "Decoration",
    vendor_name: "Line Decor",
    package_name: "Paket 'LOLIA' (Selected)",
    price: 10000000,
    notes: "Free Custom Warna kalem/earth tone. Kombinasi Bunga Artificial (atas) & Taman Pelaminan Asli (bawah). Pelaminan 8m, meja akad, karpet jalan 15m, 6 standing flower, photobooth, gate masuk.",
    status: "Selected"
  },
  {
    vendor_id: "VND-MUA-001",
    category: "MUA",
    vendor_name: "Azmi Amalia MUA X NESA",
    package_name: "Premium Attire & Make Up (Selected)",
    price: 9000000,
    notes: "Makeup Akad + Retouch Resepsi. 1 Pasang Attire Akad & Resepsi. Hijabdo + Siger. Makeup & Attire untuk 2 pasang Orang Tua + 2 pasang Pagar Ayu. Free Melati segar, softlens & fake nails.",
    status: "Selected"
  },
  {
    vendor_id: "VND-PHO-001",
    category: "Photo",
    vendor_name: "Platinum Wedding (TikTok Find)",
    package_name: "1 Day Coverage Package (Selected)",
    price: 5000000,
    notes: "8 Jam kerja, 2 Fotografer, 1 Videografer. Album Magazine Premium 20 Halaman, 300 Edit foto, 2 Bingkai 16RP, 2 Bingkai 8R. Video Highlight 60s & Video Cinematic 4m. Master file via USB.",
    status: "Selected"
  },
  {
    vendor_id: "VND-WO-001",
    category: "WO",
    vendor_name: "Dienisa MC",
    package_name: "MC & WO Paket C (Selected)",
    price: 2200000,
    notes: "Jasa MC Pernikahan + WO hari H (4 orang kru). Konsultasi Rundown. Strategi alur kerja: WO dimaksimalkan untuk asisten pengantin dan dokumentasi tamu. Urusan katering didelegasikan ke keluarga.",
    status: "Selected"
  }
];

let currentCategory = "all";
let database = [];
let budgetLimit = 100000000;
let gasUrl = "";
let geminiApiKey = "";

// Multi-Tenant Scoping
let activeProjectId = localStorage.getItem("AURA_ACTIVE_PROJECT_ID") || "WD-AURA-001";
let permissions = ["Vendor", "Budget", "Milestone", "Verify"]; // default all

// Load Local Storage Configuration & Vendors
window.onload = async function() {
  // 1. Inisialisasi Kredensial & Proyek Aktif
  setupUserSessionContext();

  // 2. Tarik Konfigurasi Endpoint Scoped
  gasUrl = localStorage.getItem(`AURA_GAS_URL_${activeProjectId}`) || "";
  geminiApiKey = localStorage.getItem("AURA_GEMINI_KEY") || "";
  budgetLimit = parseInt(localStorage.getItem(`AURA_BUDGET_LIMIT_${activeProjectId}`)) || (activeProjectContext() ? activeProjectContext().budget : 100000000);

  const limitInputEl = document.getElementById("budget-limit-input");
  if (limitInputEl) limitInputEl.value = budgetLimit;

  // Enforce RBAC on Budget editing
  enforceRoleBasedAccessControl();

  // 3. SINKRONISASI DATA LIVE DARI GOOGLE SHEETS (Dua Arah)
  if (gasUrl) {
    await fetchLiveSheetsData();
  } else {
    // Jalankan Fallback Offline (Mode Simulasi)
    loadOfflineFallbackData();
  }

  updateSyncStatus();
  calculateMotherboardBudget();
  setStatusFilter('all'); 
  renderCategorySidebar();
  renderCollaborators();
};

// Fungsi Baru: Mendapatkan Context Project Aktif secara instan
function activeProjectContext() {
  let projects = [];
  const localProjects = localStorage.getItem("AURA_PROJECTS");
  if (localProjects) {
    projects = JSON.parse(localProjects);
  }
  return projects.find(p => p.id === activeProjectId);
}

// Fungsi Baru: Menarik Data Live dari Google Sheets via GAS
async function fetchLiveSheetsData() {
  const syncIndicator = document.getElementById("sync-status");
  if (syncIndicator) {
    syncIndicator.innerHTML = `<span class="loader"></span> Menarik data Sheets...`;
    syncIndicator.className = "text-amber-500 flex items-center gap-1.5 text-[11px] font-semibold";
  }
  
  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ 
        action: "getProjectData", 
        projectId: activeProjectId,
        email: currentUser 
      })
    });
    
    const result = await response.json();
    if (result.success) {
      // Sinkronisasikan database lokal dengan data riil dari Google Sheets
      database = result.vendors || [];
      budgetLimit = parseInt(result.budgetLimit) || budgetLimit;
      
      // Update cache penyimpanan lokal
      localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
      localStorage.setItem(`AURA_BUDGET_LIMIT_${activeProjectId}`, budgetLimit);
      
      // Sinkronisasikan data pembayaran di halaman rekap
      if (result.payments) {
        localStorage.setItem(`AURA_PAYMENTS_${activeProjectId}`, JSON.stringify(result.payments));
      }
      
      showToast("Data terbaru berhasil dimuat dari Google Sheets!");
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    console.error("Gagal sinkronisasi otomatis, menggunakan cache lokal. Error:", err);
    loadOfflineFallbackData();
    showToast("Gagal terhubung ke Sheets, menggunakan data offline.");
  }
}

function loadOfflineFallbackData() {
  const localDB = localStorage.getItem(`AURA_VENDORS_DB_${activeProjectId}`);
  if (localDB) {
    database = JSON.parse(localDB);
  } else {
    database = [...DEFAULT_VENDORS];
    localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
  }
}

function setupUserSessionContext() {
  // 1. Dynamic Admin Navigation Link Injection
  if (currentUser === "admin@aura.com") {
    const navContainer = document.querySelector("nav .flex.items-center.gap-2") || document.querySelector("nav .flex.items-center.gap-3");
    if (navContainer) {
      const exists = document.getElementById("admin-console-link");
      if (!exists) {
        const adminLink = document.createElement("a");
        adminLink.id = "admin-console-link";
        adminLink.href = "admin.html";
        adminLink.className = "text-amber-400 hover:underline flex items-center gap-1 min-h-[44px] px-2 font-semibold";
        adminLink.innerHTML = `<i class="fa-solid fa-user-shield text-xs"></i> <span class="hidden xs:inline">Console Admin</span>`;
        navContainer.insertBefore(adminLink, navContainer.firstChild);
      }
    }
  }

  // 2. Fetch Multi-Tenant Project Context & Izin Pengguna
  const activeProject = activeProjectContext();
  if (activeProject) {
    // Override default wedding title jika tersedia
    const headerTitle = document.querySelector("header h1");
    if (headerTitle) headerTitle.innerText = activeProject.name;
    
    // Tarik hak akses peran aktif
    const activeUserObj = activeProject.users.find(u => u.email === currentUser);
    if (activeUserObj) {
      permissions = activeUserObj.permissions;
    }
  }

  // Superadmin mendapatkan seluruh izin secara mutlak
  if (currentUser === "admin@aura.com") {
    permissions = ["Vendor", "Budget", "Milestone", "Verify"];
  }

  // Render sapaan user greeting
  const greetingEl = document.getElementById("user-greeting");
  if (greetingEl && currentUser) {
    if (currentUser.toLowerCase().includes("rachel")) {
      greetingEl.innerText = "Rachel";
    } else if (currentUser.toLowerCase().includes("kevin")) {
      greetingEl.innerText = "Kevin";
    } else {
      if (activeProject) {
        const activeUserObj = activeProject.users.find(u => u.email === currentUser);
        if (activeUserObj) {
          greetingEl.innerText = activeUserObj.label.split(' ')[0];
        } else {
          greetingEl.innerText = currentUser.split('@')[0];
        }
      } else {
        greetingEl.innerText = currentUser.split('@')[0];
      }
    }
  }
}

function enforceRoleBasedAccessControl() {
  // Enforce RBAC on Budget editing
  if (!permissions.includes("Budget")) {
    const limitInput = document.getElementById("budget-limit-input");
    if (limitInput) {
      limitInput.disabled = true;
      limitInput.title = "Anda tidak memiliki izin untuk mengedit anggaran.";
      
      const pencilIcon = limitInput.nextElementSibling;
      if (pencilIcon && pencilIcon.classList.contains("fa-pencil")) {
        pencilIcon.classList.add("hidden");
      }
    }
    const editLimitSidebarBtn = document.getElementById("btn-edit-limit-sidebar");
    if (editLimitSidebarBtn) {
      editLimitSidebarBtn.classList.add("hidden");
    }
  }

  // Enforce RBAC on Vendor creation
  if (!permissions.includes("Vendor")) {
    const addVendorBtns = document.querySelectorAll("button[onclick='openAddVendorModal()']");
    addVendorBtns.forEach(btn => btn.classList.add("hidden"));
  }
}

function updateSyncStatus() {
  const el = document.getElementById("sync-status");
  if (gasUrl) {
    el.innerHTML = `<span class="h-2 w-2 rounded-full bg-blue-500 inline-block"></span> GAS Connected`;
    el.className = "text-blue-400 flex items-center gap-1.5 text-[11px] font-semibold";
  } else {
    el.innerHTML = `<span class="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span> Mode Simulasi`;
    el.className = "text-green-400 flex items-center gap-1.5 text-[11px] font-semibold";
  }
}

/* ==========================================================================
   BUDGET ENGINE & CALCULATION (Motherboard Live Budget)
   ========================================================================== */
function calculateMotherboardBudget() {
  const selectedVendors = database.filter(v => v.status === "Selected");
  const totalSpent = selectedVendors.reduce((sum, v) => sum + v.price, 0);
  const totalRemaining = budgetLimit - totalSpent;
  const progressPercent = Math.min(100, Math.floor((totalSpent / budgetLimit) * 100));

  // Update UI Text
  const limitEl = document.getElementById("subnav-limit");
  if (limitEl) limitEl.innerText = formatIDR(budgetLimit);
  const spentEl = document.getElementById("subnav-spent");
  if (spentEl) spentEl.innerText = formatIDR(totalSpent);
  const remainingEl = document.getElementById("subnav-remaining");
  if (remainingEl) remainingEl.innerText = formatIDR(totalRemaining);
  
  // Sticky Spent view updates
  const stickySpentEl = document.getElementById("sticky-spent-view");
  if (stickySpentEl) stickySpentEl.innerText = formatIDR(totalSpent);

  // Render Circle Graph SVG
  const budgetCircle = document.getElementById("budget-circle");
  const percentageText = document.getElementById("budget-percentage");
  if (percentageText) percentageText.innerText = `${progressPercent}%`;

  if (budgetCircle) {
    // 314 is the perimeter for r=50 stroke circle (2 * Math.PI * 50)
    const strokeOffset = 314 - (314 * progressPercent) / 100;
    budgetCircle.setAttribute("stroke-dashoffset", strokeOffset);
    
    if (progressPercent > 100) {
      budgetCircle.setAttribute("stroke", "#dc2626"); // Red if overspent
    } else {
      budgetCircle.setAttribute("stroke", "#0066cc"); // Primary blue if safe
    }
  }

  // Update status badge
  const statusBadge = document.getElementById("budget-status-badge");
  if (statusBadge) {
    if (totalRemaining >= 0) {
      statusBadge.className = "w-full text-center py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors duration-300";
      statusBadge.innerHTML = `<i class="fa-solid fa-circle-check text-xs"></i> Pengeluaran Terkontrol Aman`;
    } else {
      statusBadge.className = "w-full text-center py-2 px-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors duration-300 animate-pulse";
      statusBadge.innerHTML = `<i class="fa-solid fa-circle-exclamation text-xs"></i> Anggaran Overspent`;
    }
  }
}

function updateBudgetLimit() {
  const val = parseInt(document.getElementById("budget-limit-input").value) || 100000000;
  budgetLimit = val;
  localStorage.setItem(`AURA_BUDGET_LIMIT_${activeProjectId}`, budgetLimit);
  calculateMotherboardBudget();
  showToast("Batas Anggaran diperbarui!");
  
  if (gasUrl) {
    syncWithGAS("updateBudgetLimit", { limit: budgetLimit });
  }
}

/* ==========================================================================
   RENDER VENDORS & UI LOGIC
   ========================================================================== */
let currentStatusFilter = "all";

function setStatusFilter(status) {
  currentStatusFilter = status;
  
  // Highlight active filter button
  const filters = ["all", "Draft", "Selected", "Eliminated"];
  filters.forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (btn) {
      if (f === status) {
        btn.className = "px-3 py-1.5 rounded-lg bg-white text-apple-ink shadow-sm transition-all";
      } else {
        btn.className = "px-3 py-1.5 rounded-lg hover:text-apple-ink transition-all";
      }
    }
  });

  renderVendors();
}

function setCategory(cat) {
  currentCategory = cat;
  
  // Update header card titles
  const titleEl = document.getElementById("catalog-title");
  const subtitleEl = document.getElementById("catalog-subtitle");
  
  if (titleEl && subtitleEl) {
    const catTitles = {
      "all": "Semua Alternatif Vendor",
      "Venue": "Alternatif Venue / Gedung",
      "Catering": "Alternatif Catering",
      "Decoration": "Alternatif Dekorasi",
      "MUA": "Alternatif MUA & Attire",
      "Photo": "Alternatif Dokumentasi",
      "WO": "Alternatif WO & MC"
    };
    
    const catSubtitles = {
      "all": "Menampilkan seluruh data coretan vendor yang diajukan oleh pasangan dan planner.",
      "Venue": "Pilihan gedung pernikahan, ruang serbaguna, dan lokasi outdoor di Bandung.",
      "Catering": "Rancangan paket prasmanan, gubukan, food stall, dan paket menu katering.",
      "Decoration": "Draf dekorasi pelaminan, photobooth, lorong jalan, dan meja akad.",
      "MUA": "Paket tata rias pengantin akad, resepsi, busana keluarga, dan orang tua.",
      "Photo": "Daftar vendor fotografer, videografer cinematic, dan liputan hari H.",
      "WO": "Rekomendasi wedding organizer, MC pernikahan, dan kru koordinator hari H."
    };
    
    titleEl.innerText = catTitles[currentCategory] || "Alternatif Vendor";
    subtitleEl.innerText = catSubtitles[currentCategory] || "Pilih opsi terbaik untuk kelancaran hari H.";
  }

  renderCategorySidebar();
  renderVendors();
  checkGeminiTrigger();
}

function renderCategorySidebar() {
  const container = document.getElementById("category-sidebar");
  if (!container) return;

  const categoriesConfig = [
    { key: "all", label: "Semua" },
    { key: "Venue", label: "Venue" },
    { key: "Catering", label: "Catering" },
    { key: "Decoration", label: "Decoration" },
    { key: "MUA", label: "MUA & Attire" },
    { key: "Photo", label: "Documentation" },
    { key: "WO", label: "Entertainment & WO" }
  ];

  container.innerHTML = "";

  categoriesConfig.forEach(cat => {
    const isActive = cat.key === currentCategory;
    
    // Count vendors in database
    let count = 0;
    if (cat.key === "all") {
      count = database.length;
    } else {
      count = database.filter(v => v.category === cat.key).length;
    }

    const button = document.createElement("button");
    button.onclick = () => setCategory(cat.key);
    button.className = isActive
      ? "w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold bg-apple-primary text-white transition-all min-h-[40px]"
      : "w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold text-apple-muted80 hover:bg-apple-parchment hover:text-apple-ink transition-all min-h-[40px]";
    
    const badgeClass = isActive
      ? "bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
      : "bg-apple-parchment text-apple-muted48 text-[10px] font-bold px-2 py-0.5 rounded-full";

    button.innerHTML = `
      <span>${cat.label}</span>
      <span class="${badgeClass}">${count}</span>
    `;
    
    container.appendChild(button);
  });
}

function renderCollaborators() {
  const container = document.getElementById("collaborators-list");
  if (!container) return;

  // We find active project users
  let projects = [];
  const localProjects = localStorage.getItem("AURA_PROJECTS");
  if (localProjects) {
    projects = JSON.parse(localProjects);
  }
  const activeProject = projects.find(p => p.id === activeProjectId);

  container.innerHTML = "";

  if (!activeProject || !activeProject.users || activeProject.users.length === 0) {
    // Fallback default mockup team
    container.innerHTML = `
      <div class="flex items-center justify-between gap-3 text-xs leading-normal">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[10px]">ID</div>
          <div>
            <h4 class="font-bold text-apple-ink text-xs">Indah (Klien A)</h4>
            <p class="text-[10px] text-apple-muted48">Bandung (Inisiator)</p>
          </div>
        </div>
        <span class="h-2 w-2 rounded-full bg-gray-300"></span>
      </div>
      <div class="flex items-center justify-between gap-3 text-xs leading-normal">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-[10px]">TM</div>
          <div>
            <h4 class="font-bold text-apple-ink text-xs">Tama (Klien B)</h4>
            <p class="text-[10px] text-apple-muted48">Singapura (Decider)</p>
          </div>
        </div>
        <span class="h-2 w-2 rounded-full bg-amber-400"></span>
      </div>
      <div class="flex items-center justify-between gap-3 text-xs leading-normal">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-[10px]">WP</div>
          <div>
            <h4 class="font-bold text-apple-ink text-xs">Aura WO (Admin)</h4>
            <p class="text-[10px] text-apple-muted48">Jakarta (Planner)</p>
          </div>
        </div>
        <span class="h-2 w-2 rounded-full bg-gray-300"></span>
      </div>
    `;
    return;
  }

  // Generate dynamically based on users
  activeProject.users.forEach((u, index) => {
    // Generate initials (e.g. Rachel Adriana -> RA)
    const labelClean = u.label ? u.label.split('(')[0].trim() : 'User';
    const initials = labelClean.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    // Assign locations & role descriptions for mockup fidelity
    let location = "Bandung";
    let subRole = u.role === "CLIENT_DECIDER" ? "Decider" : "Inisiator";
    let clientLabel = index === 0 ? "Klien A" : "Klien B";

    if (u.email.includes("tama")) {
      location = "Singapura";
      subRole = "Decider";
    } else if (u.email.includes("indah")) {
      location = "Bandung";
      subRole = "Inisiator";
    } else if (u.email.includes("rachel")) {
      location = "Bandung";
      subRole = "Decider";
    } else if (u.email.includes("kevin")) {
      location = "Jakarta";
      subRole = "Inisiator";
    }

    const initialsBg = index === 0 ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600";
    
    // Status dot color: Active user is active (amber or green dot), others are grey
    const isCurrentUser = u.email === currentUser;
    const dotColor = isCurrentUser ? "bg-amber-400" : "bg-gray-300";

    const item = document.createElement("div");
    item.className = "flex items-center justify-between gap-3 text-xs leading-normal";
    item.innerHTML = `
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-full ${initialsBg} flex items-center justify-center font-bold text-[10px]">${initials}</div>
        <div>
          <h4 class="font-bold text-apple-ink text-xs">${labelClean} (${clientLabel})</h4>
          <p class="text-[10px] text-apple-muted48">${location} (${subRole})</p>
        </div>
      </div>
      <span class="h-2 w-2 rounded-full ${dotColor}"></span>
    `;
    container.appendChild(item);
  });

  // Always append Admin
  const adminItem = document.createElement("div");
  adminItem.className = "flex items-center justify-between gap-3 text-xs leading-normal";
  adminItem.innerHTML = `
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-[10px]">WP</div>
      <div>
        <h4 class="font-bold text-apple-ink text-xs">Aura WO (Admin)</h4>
        <p class="text-[10px] text-apple-muted48">Jakarta (Planner)</p>
      </div>
    </div>
    <span class="h-2 w-2 rounded-full bg-gray-300"></span>
  `;
  container.appendChild(adminItem);
}

function editBudgetLimitFromSidebar() {
  if (!permissions.includes("Budget")) {
    showToast("Anda tidak memiliki izin untuk mengedit anggaran.");
    return;
  }
  showConfirm(
    "Ubah Anggaran Maksimal",
    `Batas anggaran saat ini: ${formatIDR(budgetLimit)}. Apakah Anda ingin mengubahnya?`,
    () => {
      const val = prompt("Masukkan Limit Anggaran Pernikahan baru (IDR):", budgetLimit);
      if (val !== null) {
        const num = parseInt(val) || 100000000;
        budgetLimit = num;
        localStorage.setItem(`AURA_BUDGET_LIMIT_${activeProjectId}`, budgetLimit);
        
        // Update input element if it exists in configuration modal
        const limitInput = document.getElementById("budget-limit-input");
        if (limitInput) limitInput.value = budgetLimit;

        calculateMotherboardBudget();
        showToast("Batas Anggaran berhasil diperbarui!");
        
        if (gasUrl) {
          syncWithGAS("updateBudgetLimit", { limit: budgetLimit });
        }
      }
    }
  );
}

function renderVendors() {
  const grid = document.getElementById("vendors-grid");
  grid.innerHTML = "";

  let filtered = currentCategory === "all" 
    ? database 
    : database.filter(v => v.category === currentCategory);

  if (currentStatusFilter !== "all") {
    filtered = filtered.filter(v => v.status === currentStatusFilter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center border-2 border-dashed border-apple-hairline rounded-3xl bg-white px-6">
        <div class="w-12 h-12 bg-apple-parchment rounded-full flex items-center justify-center text-apple-muted48 text-lg mx-auto mb-4">
          <i class="fa-solid fa-list-check"></i>
        </div>
        <h4 class="text-[15px] font-bold text-apple-ink">Belum Ada Vendor di Kategori Ini</h4>
        <p class="text-xs text-apple-muted48 mt-1.5 mb-6 max-w-sm mx-auto leading-relaxed">Mulai tambahkan opsi vendor menarik dari brosur/pricelist yang telah Anda kumpulkan bersama pasangan.</p>
        ${permissions.includes("Vendor") ? `
          <button onclick="openAddVendorModal()" class="bg-apple-primary hover:bg-apple-primaryFocus text-white text-xs font-bold px-5 py-2.5 rounded-full transition-all transform active:scale-95 flex items-center justify-center gap-1.5 shadow-sm mx-auto min-h-[40px]">
            Tambah Vendor Baru
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  filtered.forEach(v => {
    const isSelected = v.status === "Selected";
    const isEliminated = v.status === "Eliminated";
    
    let cardBg = "bg-apple-parchment";
    let tagHtml = "";

    if (isSelected) {
      cardBg = "bg-white border border-apple-primary/30 shadow-sm";
      tagHtml = `<span class="bg-apple-primary text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1"><i class="fa-solid fa-check text-[8px]"></i> Terpilih</span>`;
    } else if (isEliminated) {
      cardBg = "bg-apple-parchment/40 border border-dashed border-apple-hairline opacity-60";
      tagHtml = `<span class="bg-apple-muted48/20 text-apple-muted48 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1"><i class="fa-solid fa-ban text-[8px]"></i> Dieliminasi</span>`;
    } else {
      cardBg = "bg-white border border-apple-hairline";
      tagHtml = `<span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Kandidat</span>`;
    }

    // Mock Image Asset generated with elegant letters according to categories
    const categoryInitial = v.category.substring(0,3).toUpperCase();
    
    const card = document.createElement("div");
    card.className = `${cardBg} p-5 rounded-2xl flex flex-col justify-between hover:scale-[1.01] transition-all duration-300`;
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3.5">
          <span class="text-[10px] bg-apple-parchment text-apple-ink px-2.5 py-1 rounded-md font-semibold tracking-wider uppercase">${v.category}</span>
          ${tagHtml}
        </div>
        <h3 class="text-[15px] font-bold text-apple-ink truncate mb-0.5">${v.vendor_name}</h3>
        <p class="text-xs text-apple-muted48 font-medium truncate mb-2.5">${v.package_name}</p>
        
        <span class="text-sm font-bold text-apple-primary block mb-3">${formatIDR(v.price)}</span>
        <p class="text-xs text-apple-muted80 leading-relaxed mb-5 line-clamp-3">${v.notes}</p>
      </div>

      ${permissions.includes("Vendor") ? `
      <div class="border-t border-apple-hairline/60 pt-3.5 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1">
            ${!isSelected ? `
              <button onclick="changeVendorStatus('${v.vendor_id}', 'Selected')" class="bg-apple-primary hover:bg-apple-primaryFocus text-white text-[11px] font-bold px-3 py-1.5 rounded-full transition-all transform active:scale-95 flex items-center justify-center">
                Pilih
              </button>
            ` : ''}
            ${!isEliminated ? `
              <button onclick="changeVendorStatus('${v.vendor_id}', 'Eliminated')" class="border border-apple-hairline text-apple-ink hover:bg-apple-parchment text-[11px] font-bold px-3 py-1.5 rounded-full transition-all flex items-center justify-center">
                Eliminasi
              </button>
            ` : ''}
            ${isSelected || isEliminated ? `
              <button onclick="changeVendorStatus('${v.vendor_id}', 'Draft')" class="bg-apple-pearl text-apple-muted80 hover:bg-apple-parchment text-[11px] font-semibold px-3 py-1.5 rounded-full border border-apple-hairline transition-all flex items-center justify-center">
                Draft
              </button>
            ` : ''}
          </div>
          <div class="flex items-center">
            <button onclick="openVendorDetail('${v.vendor_id}')" class="text-apple-primary hover:underline text-[11px] font-semibold px-2 min-h-[40px] flex items-center justify-center">
              Detail <i class="fa-solid fa-chevron-right text-[8px] ml-1"></i>
            </button>
            <button onclick="confirmDeleteVendor('${v.vendor_id}')" class="text-red-500 hover:text-red-700 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center" title="Hapus Vendor">
              <i class="fa-regular fa-trash-can text-sm"></i>
            </button>
          </div>
        </div>
      </div>
      ` : `
      <div class="border-t border-apple-hairline/60 pt-3 flex items-center justify-between text-xs">
        <span class="text-[10px] text-apple-muted48 font-semibold"><i class="fa-solid fa-lock text-[9px] mr-1"></i> Hanya Lihat</span>
        <button onclick="openVendorDetail('${v.vendor_id}')" class="text-apple-primary hover:underline text-[11px] font-semibold px-2 min-h-[40px] flex items-center justify-center">
          Detail <i class="fa-solid fa-chevron-right text-[8px] ml-1"></i>
        </button>
      </div>
      `}
    `;
    grid.appendChild(card);
  });
}

/* ==========================================================================
   GEMINI AI COMPARISON ENGINE
   ========================================================================== */
function checkGeminiTrigger() {
  const activeCat = currentCategory;
  const count = database.filter(v => v.category === activeCat).length;
  const container = document.getElementById("gemini-trigger-container");

  if (activeCat !== "all" && count >= 2) {
    document.getElementById("gemini-active-category").innerText = activeCat;
    container.classList.remove("hidden");
  } else {
    container.classList.add("hidden");
  }
}

async function runGeminiComparison() {
  const activeCat = currentCategory;
  const candidates = database.filter(v => v.category === activeCat);
  
  const panel = document.getElementById("gemini-analysis-panel");
  const content = document.getElementById("ai-panel-content");
  const title = document.getElementById("ai-panel-title");

  title.innerText = `AI Menyiapkan Perbandingan ${activeCat}...`;
  content.innerHTML = `
    <div class="flex items-center gap-3 py-8 text-apple-muted48 justify-center">
      <div class="loader"></div>
      <span class="text-xs font-semibold uppercase tracking-wider">Menganalisis Spesifikasi Data Vendor Rachel & Kevin...</span>
    </div>
  `;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: 'smooth' });

  // 1. Validasi Keberadaan API Key
  if (!geminiApiKey) {
    content.innerHTML = `
      <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-xs">
        <h4 class="font-bold mb-1 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation"></i> API Key Gemini Belum Ada</h4>
        <p class="mb-3">Untuk membandingkan opsi vendor menggunakan Gemini AI, masukkan API Key Anda terlebih dahulu.</p>
        <button onclick="openConfigModal()" class="bg-amber-700 hover:bg-amber-800 text-white font-semibold px-4 py-2.5 rounded-full transition-all min-h-[40px]">Masukkan API Key</button>
      </div>
    `;
    return;
  }

  // 2. Susun Prompt Komparasi Vendor
  let vendorSummaryPrompt = `Lakukan analisis perbandingan teknis untuk vendor pernikahan pada kategori "${activeCat}" dari rencana pernikahan Rachel & Kevin. Berikut adalah list vendor kandidat:\n\n`;
  candidates.forEach((v, index) => {
    vendorSummaryPrompt += `Vendor #${index + 1}: ${v.vendor_name}\n`;
    vendorSummaryPrompt += `- Paket: ${v.package_name}\n`;
    vendorSummaryPrompt += `- Harga: ${formatIDR(v.price)}\n`;
    vendorSummaryPrompt += `- Detail/Fasilitas: ${v.notes}\n\n`;
  });

  vendorSummaryPrompt += `
Aturan Output Analisis:
1. Wajib menyajikan Tabel Perbandingan Teknis (Markdown) yang menyejajarkan parameter penting seperti Harga, Kapasitas/Fasilitas, Kebutuhan Biaya Tambahan tak terduga, dan Kelebihan/Kekurangan masing-masing.
2. Berikan analisis "Titik Kritis" (analisis risiko operasional, keterbatasan koordinasi, atau biaya tersembunyi yang mungkin tidak disadari pasangan).
3. Berikan rekomendasi akhir rasional yang paling efisien berdasarkan budget motherboard (Total Anggaran Saat ini, target di bawah 100 Juta).
4. Gunakan gaya bahasa yang profesional, elegan, menenangkan bagi pengantin, dan sangat terstruktur. Gunakan bahasa Indonesia murni.
`;

  const payload = {
    contents: [{ parts: [{ text: vendorSummaryPrompt }] }],
    systemInstruction: { parts: [{ text: "Anda adalah Expert Wedding Advisor premium. Analisis Anda menyajikan tabel markdown komparatif yang ketat dan bersih tanpa basa-basi berlebih." }] }
  };

  // 3. Sistem Urutan Model Fallback (Mencegah HTTP 404)
  const models = [
    "gemini-2.5-flash-preview-09-2025", // Model Pratinjau Sandbox
    "gemini-2.5-flash",                 // Model Stabil Utama (Rekomendasi Publik)
    "gemini-1.5-flash"                  // Model Kompatibilitas Luas
  ];

  let responseText = null;
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      
      // Memanggil API dengan mekanisme fetch retry
      const textResponse = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await textResponse.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (responseText) {
        console.log(`Berhasil memproses menggunakan model: ${model}`);
        break; // Jika sukses mendapatkan teks, hentikan perulangan fallback
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gagal memproses dengan model ${model}. Mencoba fallback berikutnya...`);
    }
  }

  // 4. Tampilkan Hasil Analisis atau Pesan Error Akhir
  if (responseText) {
    title.innerText = `Analisis Kurasi Gemini AI: Kategori ${activeCat}`;
    content.innerHTML = marked.parse(responseText);
    wrapMarkdownTables(); // Bungkus tabel agar responsive di HP
  } else {
    content.innerHTML = `
      <div class="bg-red-50 border border-red-200 p-4 rounded-xl text-red-800 text-xs">
        <h4 class="font-bold mb-1 flex items-center gap-1.5"><i class="fa-solid fa-circle-exclamation"></i> Gagal Memproses Analisis Gemini</h4>
        <p class="mb-2">Terjadi gangguan koneksi API pada semua model fallback. Mohon periksa kembali API Key Anda atau pastikan kunci tersebut memiliki kuota gratis aktif.</p>
        <span class="text-[9px] block font-mono text-red-600 truncate">${lastError ? lastError.message : 'Unknown Error'}</span>
      </div>
    `;
  }
}

function wrapMarkdownTables() {
  const tables = document.getElementById("ai-panel-content").querySelectorAll("table");
  tables.forEach(table => {
    if (!table.parentElement.classList.contains('overflow-x-auto')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'overflow-x-auto w-full no-scrollbar my-4 border border-apple-hairline rounded-xl shadow-sm bg-white';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 1000) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (retries > 0 && response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw new Error(`HTTP Error status: ${response.status}`);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

function closeAIPanel() {
  document.getElementById("gemini-analysis-panel").classList.add("hidden");
}

/* ==========================================================================
   IMMERSIVE DETAIL SHEET MANAGER (Halaman Detail Vendor Pilihan)
   ========================================================================== */
function openVendorDetail(vendorId) {
  const v = database.find(item => item.vendor_id === vendorId);
  if (!v) return;

  // Populate text details
  document.getElementById("detail-badge").innerText = v.category;
  document.getElementById("detail-name").innerText = v.vendor_name;
  document.getElementById("detail-package").innerText = v.package_name;
  document.getElementById("detail-price").innerText = formatIDR(v.price);
  document.getElementById("detail-placeholder-letter").innerText = v.category.substring(0,3).toUpperCase();
  document.getElementById("detail-notes").innerText = v.notes;

  // Populate brochure image
  const brochureImgEl = document.getElementById("detail-brochure-img");
  const placeholderContainer = document.getElementById("detail-placeholder-container");

  if (v.brochure_img) {
    if (brochureImgEl) {
      brochureImgEl.src = v.brochure_img;
      brochureImgEl.classList.remove("hidden");
    }
    if (placeholderContainer) {
      placeholderContainer.classList.add("hidden");
    }
  } else {
    if (brochureImgEl) {
      brochureImgEl.src = "";
      brochureImgEl.classList.add("hidden");
    }
    if (placeholderContainer) {
      placeholderContainer.classList.remove("hidden");
    }
  }

  // Populate Google Drive link
  const driveSection = document.getElementById("detail-drive-section");
  const driveLink = document.getElementById("detail-drive-link");

  if (v.drive_url) {
    if (driveLink) driveLink.href = v.drive_url;
    if (driveSection) driveSection.classList.remove("hidden");
  } else {
    if (driveSection) driveSection.classList.add("hidden");
  }

  // Price Calculations (1,000 Pax assumption)
  const costPerGuest = Math.round(v.price / 1000);
  document.getElementById("detail-cost-per-guest").innerText = formatIDR(costPerGuest);

  // Percentage of current limit allocation
  const allocationPercent = ((v.price / budgetLimit) * 100).toFixed(1);
  document.getElementById("detail-allocation").innerText = `${allocationPercent}%`;

  // Status Badge Styling
  const statusBadge = document.getElementById("detail-status-badge");
  if (v.status === "Selected") {
    statusBadge.className = "bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1";
    statusBadge.innerHTML = `<i class="fa-solid fa-check text-[8px]"></i> Terpilih`;
  } else if (v.status === "Eliminated") {
    statusBadge.className = "bg-red-100 text-red-800 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1";
    statusBadge.innerHTML = `<i class="fa-solid fa-ban text-[8px]"></i> Dieliminasi`;
  } else {
    statusBadge.className = "bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1";
    statusBadge.innerHTML = `Draft`;
  }

  // Generate dynamic Action Tasklist Checkbox based on Vendor Category
  const checklistContainer = document.getElementById("detail-checklist");
  checklistContainer.innerHTML = "";
  
  const checklistTemplates = {
    "Venue": [
      "Jadwalkan survei fisik lokasi bersama pasangan dan perwakilan keluarga.",
      "Diskusikan ketersediaan transit keluarga dengan panitia lokal.",
      "Konfirmasi ulang beban biaya listrik tambahan ke perwakilan gedung.",
      "Ajukan izin kepolisian & penataan parkir via perwakilan daerah."
    ],
    "Catering": [
      "Atur janji uji rasa (food tasting) katering di Lembang.",
      "Verifikasi detail komposisi menu gubukan porsi 60% dengan keluarga.",
      "Diskusikan skenario tata letak alur prasmanan agar tamu mengalir lancar.",
      "Kirim kontrak DP 30% setelah menu fiksasi disepakati bersama pasangan."
    ],
    "Decoration": [
      "Konfirmasi luas area panggung pelaminan Aula Ditkuad (7x9m).",
      "Kirim referensi foto palet warna earth tone dekorasi di grup koordinasi.",
      "Finalisasi draf desain gapura masuk dengan vendor Line Decor.",
      "Tentukan porsi penempatan taman bunga segar di bagian bawah panggung."
    ],
    "MUA": [
      "Kirim detail foto model kebaya akad & resep pernikahan adat Sunda.",
      "Jadwalkan sesi uji rias (test make-up) sebulan sebelum acara.",
      "Konfirmasi daftar ukuran busana untuk seluruh pager ayu & orang tua.",
      "Review kelengkapan aksesoris siger Sunda & melati segar."
    ],
    "Photo": [
      "Kirim daftar list shot wajib (shotlist) dokumentasi via Google Drive.",
      "Pastikan 1 video cinematic & highlight 60s fiks sebelum draf album cetak.",
      "Tentukan 2 orang PIC keluarga sebagai pengatur antrean sesi foto panggung.",
      "Konfirmasi slot waktu 8 jam kerja coverage akad hingga resepsi selesai."
    ],
    "WO": [
      "Lakukan rapat koordinasi rundowm perdana via Google Meet mingguan.",
      "Pastikan 4 orang kru WO siap mengawal alur pengantin & logistik keluarga.",
      "Hubungkan narahubung utama WO dengan PIC konsumsi pihak keluarga Bandung.",
      "Kirim final draf rundown PDF ke grup Whatsapp panitia H-7 pernikahan."
    ]
  };

  const tasks = checklistTemplates[v.category] || [
    "Verifikasi ulang spesifikasi paket vendor pernikahan.",
    "Diskusikan regulasi pembayaran DP & pelunasan bersama pasangan.",
    "Cek ulasan portofolio pengerjaan vendor di media sosial."
  ];

  tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.className = "flex items-start gap-2.5";
    li.innerHTML = `
      <input type="checkbox" id="task-${idx}" class="mt-0.5 rounded text-apple-primary focus:ring-apple-primary h-4 w-4 border-apple-hairline cursor-pointer">
      <label for="task-${idx}" class="cursor-pointer select-none leading-relaxed">${task}</label>
    `;
    checklistContainer.appendChild(li);
  });

  // Populate dynamic Warning alert text
  const ldrWarningEl = document.getElementById("detail-ldr-warning");
  if (v.status === "Selected") {
    ldrWarningEl.innerText = `Vendor ini telah disepakati terpilih. Prioritaskan komunikasi rutin mingguan dengan tim ${v.vendor_name} untuk memantau kemajuan persiapan.`;
  } else {
    ldrWarningEl.innerText = `Ini adalah opsi draf/kandidat. Lakukan pencocokan parameter harga dan kapasitas dengan pasangan Anda sebelum memutuskan status terpilih.`;
  }

  // Configure Footer Button Status Toggle inside Detail view
  const actionToggleBtn = document.getElementById("detail-action-toggle");
  if (v.status === "Selected") {
    actionToggleBtn.innerText = "Eliminasi Vendor Ini";
    actionToggleBtn.className = "bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-5 py-2.5 rounded-full transition-all transform active:scale-95 min-h-[44px]";
    actionToggleBtn.onclick = () => {
      closeVendorDetail();
      changeVendorStatus(v.vendor_id, "Eliminated");
    };
  } else {
    actionToggleBtn.innerText = "Pilih Vendor Ini";
    actionToggleBtn.className = "bg-apple-primary hover:bg-apple-primaryFocus text-white text-xs font-semibold px-5 py-2.5 rounded-full transition-all transform active:scale-95 min-h-[44px]";
    actionToggleBtn.onclick = () => {
      closeVendorDetail();
      changeVendorStatus(v.vendor_id, "Selected");
    };
  }

  // Display Sheet with Slide-over Animation
  const sheet = document.getElementById("vendor-detail-sheet");
  sheet.classList.remove("hidden");
  
  setTimeout(() => {
    document.getElementById("vendor-detail-panel").classList.add("slide-over-active");
  }, 50);
}

function closeVendorDetail() {
  const panel = document.getElementById("vendor-detail-panel");
  panel.classList.remove("slide-over-active");
  
  setTimeout(() => {
    document.getElementById("vendor-detail-sheet").classList.add("hidden");
  }, 400);
}

/* ==========================================================================
   MUTATION OPERATIONS & STATE HANDLER
   ========================================================================== */
function changeVendorStatus(vendorId, newStatus) {
  const idx = database.findIndex(v => v.vendor_id === vendorId);
  if (idx !== -1) {
    database[idx].status = newStatus;
    
    // Single Selected Safeguard
    if (newStatus === "Selected") {
      const category = database[idx].category;
      database.forEach(v => {
        if (v.category === category && v.vendor_id !== vendorId && v.status === "Selected") {
          v.status = "Draft";
        }
      });
    }

    localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
    calculateMotherboardBudget();
    renderVendors();
    checkGeminiTrigger();
    showToast("Status vendor diperbarui!");

    if (gasUrl) {
      syncWithGAS("updateVendorStatus", { vendor_id: vendorId, status: newStatus });
    }
  }
}

let uploadedBrochureBase64 = "";

function handleBrochureUpload(e) {
  const file = e.target.files[0];
  const previewText = document.getElementById("brochure-preview-text");
  const thumbnail = document.getElementById("brochure-thumbnail");
  const icon = document.getElementById("brochure-upload-icon");

  if (!file) {
    uploadedBrochureBase64 = "";
    if (previewText) previewText.innerText = "Pilih foto brosur (atau kosongkan untuk acak)";
    if (thumbnail) thumbnail.classList.add("hidden");
    if (icon) icon.classList.remove("hidden");
    return;
  }

  if (previewText) previewText.innerText = file.name;

  const reader = new FileReader();
  reader.onload = function(event) {
    uploadedBrochureBase64 = event.target.result;
    if (thumbnail) {
      thumbnail.src = uploadedBrochureBase64;
      thumbnail.classList.remove("hidden");
    }
    if (icon) icon.classList.add("hidden");
  };
  reader.readAsDataURL(file);
}

function submitNewVendor(e) {
  e.preventDefault();
  
  const driveUrl = document.getElementById("form-drive-url").value.trim();

  const newVendor = {
    vendor_id: `VND-${document.getElementById("form-category").value.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
    category: document.getElementById("form-category").value,
    vendor_name: document.getElementById("form-name").value,
    package_name: document.getElementById("form-package").value,
    price: parseInt(document.getElementById("form-price").value) || 0,
    notes: document.getElementById("form-notes").value,
    status: "Draft",
    brochure_img: uploadedBrochureBase64 || "",
    drive_url: driveUrl || ""
  };

  database.push(newVendor);
  localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
  
  calculateMotherboardBudget();
  renderVendors();
  checkGeminiTrigger();
  closeAddVendorModal();
  showToast("Vendor baru masuk ke draf!");

  if (gasUrl) {
    syncWithGAS("addVendor", newVendor);
  }

  // Reset form and uploaded image state
  document.getElementById("add-vendor-form").reset();
  uploadedBrochureBase64 = "";
  const previewText = document.getElementById("brochure-preview-text");
  const thumbnail = document.getElementById("brochure-thumbnail");
  const icon = document.getElementById("brochure-upload-icon");
  if (previewText) previewText.innerText = "Pilih foto brosur (atau kosongkan untuk acak)";
  if (thumbnail) {
    thumbnail.src = "";
    thumbnail.classList.add("hidden");
  }
  if (icon) icon.classList.remove("hidden");
}

function confirmDeleteVendor(vendorId) {
  showConfirm(
    "Hapus Vendor",
    "Apakah Anda yakin ingin menghapus data vendor ini dari motherboard draf?",
    () => {
      database = database.filter(v => v.vendor_id !== vendorId);
      localStorage.setItem(`AURA_VENDORS_DB_${activeProjectId}`, JSON.stringify(database));
      
      calculateMotherboardBudget();
      renderVendors();
      checkGeminiTrigger();
      showToast("Vendor telah dihapus.");

      if (gasUrl) {
        syncWithGAS("deleteVendor", { vendor_id: vendorId });
      }
    }
  );
}

/* ==========================================================================
   GAS SYNC ENGINE (Google Sheets API Integration)
   ========================================================================== */
async function syncWithGAS(action, payload) {
  if (!gasUrl) return;

  const syncIndicator = document.getElementById("sync-status");
  syncIndicator.innerHTML = `<span class="loader"></span>`;
  syncIndicator.className = "text-amber-500 flex items-center gap-1 text-[11px] font-semibold";

  try {
    const res = await fetchWithRetry(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: action, data: payload, email: currentUser })
    });
    
    if (res.ok) {
      updateSyncStatus();
      showToast("Database cloud berhasil disinkronkan!");
    }
  } catch (err) {
    syncIndicator.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span> Error`;
    syncIndicator.className = "text-red-500 flex items-center gap-1 text-[11px] font-semibold";
  }
}

/* ==========================================================================
   MODALS & DIALOGS CONTROLLER (Pure Touch Friendly Style)
   ========================================================================== */
function openAddVendorModal() {
  const m = document.getElementById("add-vendor-modal");
  m.classList.remove("hidden");
}

function closeAddVendorModal() {
  document.getElementById("add-vendor-modal").classList.add("hidden");
  
  // Reset form and file previews
  document.getElementById("add-vendor-form").reset();
  uploadedBrochureBase64 = "";
  const previewText = document.getElementById("brochure-preview-text");
  const thumbnail = document.getElementById("brochure-thumbnail");
  const icon = document.getElementById("brochure-upload-icon");
  if (previewText) previewText.innerText = "Pilih foto brosur (atau kosongkan untuk acak)";
  if (thumbnail) {
    thumbnail.src = "";
    thumbnail.classList.add("hidden");
  }
  if (icon) icon.classList.remove("hidden");
}

function openConfigModal() {
  document.getElementById("config-modal").classList.remove("hidden");
}

function closeConfigModal() {
  document.getElementById("config-modal").classList.add("hidden");
}

function saveConfiguration() {
  gasUrl = document.getElementById("config-gas-url").value.trim();
  geminiApiKey = document.getElementById("config-gemini-key").value.trim();

  localStorage.setItem(`AURA_GAS_URL_${activeProjectId}`, gasUrl);
  localStorage.setItem("AURA_GEMINI_KEY", geminiApiKey);

  updateSyncStatus();
  closeConfigModal();
  checkGeminiTrigger();
  showToast("Koneksi berhasil disimpan!");
}

function showToast(msg) {
  const t = document.getElementById("custom-toast");
  t.innerText = msg;
  t.style.opacity = "1";
  t.style.pointerEvents = "auto";
  
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.pointerEvents = "none";
  }, 3000);
}

function showConfirm(title, message, onOk) {
  const modal = document.getElementById("custom-confirm-modal");
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-msg").innerText = message;
  
  modal.classList.remove("hidden");
  
  const btnOk = document.getElementById("btn-confirm-ok");
  const btnCancel = document.getElementById("btn-confirm-cancel");
  
  const cleanUp = () => {
    modal.classList.add("hidden");
    btnOk.onclick = null;
    btnCancel.onclick = null;
  };
  
  btnOk.onclick = () => {
    onOk();
    cleanUp();
  };
  
  btnCancel.onclick = () => {
    cleanUp();
  };
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */
function formatIDR(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}
