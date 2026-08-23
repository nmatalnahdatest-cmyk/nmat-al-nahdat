// ==========================================
        // LOCAL STORAGE & DATA LAYER
        // ==========================================
        const STORAGE_KEYS = {
            AUTH: 'nmat_al_nahdat_auth',
            LAST_SAVED: 'nmat_al_nahdat_last_saved',
            EMPLOYEES: 'saudi_ems_employees',
            COMPANIES: 'saudi_ems_companies',
            PAYMENTS: 'saudi_ems_payments',
            TRANSACTIONS: 'saudi_ems_transactions',
            SETTINGS: 'saudi_ems_settings',
            LOGS: 'saudi_ems_logs',
            LANG: 'saudi_ems_lang'
        };

        const defaultSettings = {
            businessName: 'Saudi EMS Portal',
            defaultFee: 350,
            currency: 'SAR',
            dateFormat: 'YYYY-MM-DD'
        };

        const i18n = {
            en: {
                nav_dashboard: "Dashboard",
                nav_employees: "Employees",
                nav_companies: "Companies",
                nav_payments: "Monthly Payments",
                nav_history: "Payment History",
                nav_id_expiry: "ID Expiry",
                nav_reports: "Reports",
                nav_settings: "Settings",
                global_search: "Search ID, Name, Iqama...",
                notifications: "Notifications",
                no_new_notif: "No urgent notifications",
                add_employee: "+ Add Employee",
                add_company: "+ Add Company",
                record_payment: "+ Record Payment",
                view_unpaid: "View Unpaid",
                view_expiring: "View Expiring IDs",
                gen_report: "Generate Report",
                active_emp: "Active Employees",
                total_emp: "Total Employees",
                exp_collected: "Expected vs Collected",
                paid: "Paid",
                unpaid: "Unpaid",
                partial: "Partial",
                waived: "Waived",
                sar: "SAR"
            },
            ar: {
                nav_dashboard: "لوحة التحكم",
                nav_employees: "إدارة الموظفين",
                nav_companies: "إدارة الشركات",
                nav_payments: "الدفعات الشهرية",
                nav_history: "سجل الدفعات",
                nav_id_expiry: "صلاحية الإقامة",
                nav_reports: "التقارير",
                nav_settings: "الإعدادات",
                global_search: "بحث باسم، هويّة، إقامة...",
                notifications: "التنبيهات",
                no_new_notif: "لا توجد تنبيهات عاجلة",
                add_employee: "+ إضافة موظف",
                add_company: "+ إضافة شركة",
                record_payment: "+ تسجيل دفعة",
                view_unpaid: "عرض غير المدفوع",
                view_expiring: "إقامات تنتهي قريباً",
                gen_report: "إنشاء تقرير",
                active_emp: "الموظفين النشطين",
                total_emp: "إجمالي الموظفين",
                exp_collected: "المتوقع مقابل المحصل",
                paid: "مدفوع",
                unpaid: "غير مدفوع",
                partial: "جزئي",
                waived: "معفى",
                sar: "ر.س"
            }
        };

        // ==========================================
        // SUPABASE ONLINE DATA LAYER
        // ==========================================
        // LocalStorage remains as a small offline cache. The source of truth is Supabase.
        const SUPABASE_URL = 'https://nwwxnscugselsofebrwd.supabase.co';
        const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_A0YrcJSZHj0dqdc7Y3MHZA_noSSB5a6';
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
        let onlineUser = null;
        let onlineDataReady = false;
        const dataCache = {};

        function getData(key) {
            if (Object.prototype.hasOwnProperty.call(dataCache, key)) return dataCache[key];
            try {
                const raw = localStorage.getItem(key);
                const value = raw ? JSON.parse(raw) : null;
                dataCache[key] = value;
                return value;
            } catch (error) {
                console.error('Storage read error:', key, error);
                return null;
            }
        }

        function saveData(key, val) {
            dataCache[key] = val;
            try {
                localStorage.setItem(key, JSON.stringify(val));
                localStorage.setItem(STORAGE_KEYS.LAST_SAVED, new Date().toISOString());
            } catch (error) {
                console.error('Local cache save error:', key, error);
            }

            // Keep the UI synchronous while syncing to Supabase in the background.
            if (onlineUser && onlineDataReady && key !== STORAGE_KEYS.AUTH && key !== STORAGE_KEYS.LANG && key !== STORAGE_KEYS.LAST_SAVED) {
                syncDataKey(key, val);
            }
            return true;
        }

        async function syncDataKey(key, value) {
            if (!onlineUser) return;
            const { error } = await supabaseClient
                .from('app_data')
                .upsert({ user_id: onlineUser.id, data_key: key, data_value: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,data_key' });
            if (error) {
                console.error('Supabase sync error:', key, error);
                showToast('Online save failed. Check your internet connection.', 'danger');
            }
        }

        async function loadCloudData() {
            if (!onlineUser) return false;
            const { data, error } = await supabaseClient
                .from('app_data')
                .select('data_key,data_value')
                .eq('user_id', onlineUser.id);
            if (error) {
                console.error('Supabase load error:', error);
                showToast('Could not load online data: ' + error.message, 'danger');
                return false;
            }

            const rows = data || [];
            if (rows.length === 0) {
                // First login: migrate existing browser data to the online account.
                const keys = [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.COMPANIES, STORAGE_KEYS.EMPLOYEES, STORAGE_KEYS.PAYMENTS, STORAGE_KEYS.LOGS];
                for (const key of keys) {
                    const value = getData(key);
                    if (value !== null && value !== undefined) await syncDataKey(key, value);
                }
            } else {
                rows.forEach(row => {
                    dataCache[row.data_key] = row.data_value;
                    try { localStorage.setItem(row.data_key, JSON.stringify(row.data_value)); } catch (_) {}
                });
            }
            onlineDataReady = true;
            return true;
        }

        async function ensureOnlineData() {
            const { data: { session } } = await supabaseClient.auth.getSession();
            onlineUser = session?.user || null;
            if (!onlineUser) return false;
            return await loadCloudData();
        }

        // Supabase authentication replaces the old hard-coded admin/admin123 login.
        function isAdminLoggedIn() {
            return !!onlineUser;
        }

        function showLoginScreen() {
            const screen = document.getElementById('loginScreen');
            if (screen) screen.classList.remove('d-none');
            document.body.classList.add('login-locked');
            const appShell = document.getElementById('appShell');
            if (appShell) appShell.classList.add('d-none');
        }

        function hideLoginScreen() {
            const screen = document.getElementById('loginScreen');
            if (screen) screen.classList.add('d-none');
            document.body.classList.remove('login-locked');
            const appShell = document.getElementById('appShell');
            if (appShell) appShell.classList.remove('d-none');
        }

        async function loginAdmin(event) {
            event.preventDefault();
            const email = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const error = document.getElementById('loginError');
            if (!email || !password) return;

            const { data, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (authError) {
                if (error) {
                    error.textContent = authError.message;
                    error.classList.remove('d-none');
                }
                return;
            }

            onlineUser = data.user;
            await loadCloudData();
            if (error) error.classList.add('d-none');
            hideLoginScreen();
            updateAdminHeader();
            renderPage(currentPage);
            showToast('Welcome, ' + (onlineUser.user_metadata?.name || onlineUser.email) + '.');
        }

        async function logoutAdmin() {
            if (!confirm('Log out from Admin User?')) return;
            await supabaseClient.auth.signOut();
            onlineUser = null;
            onlineDataReady = false;
            showLoginScreen();
            const password = document.getElementById('loginPassword');
            if (password) password.value = '';
        }

        function updateAdminHeader() {
            const authName = onlineUser?.user_metadata?.name || onlineUser?.email || 'Admin User';
            const label = document.getElementById('adminUserName');
            const avatar = document.getElementById('adminAvatar');
            if (label) label.textContent = authName;
            if (avatar) avatar.textContent = authName.charAt(0).toUpperCase();
            const lastSaved = document.getElementById('lastSavedText');
            const savedAt = localStorage.getItem(STORAGE_KEYS.LAST_SAVED);
            if (lastSaved && savedAt) {
                lastSaved.textContent = 'Saved: ' + new Date(savedAt).toLocaleString();
                lastSaved.title = savedAt;
            }
        }

        window.loginAdmin = loginAdmin;
        window.logoutAdmin = logoutAdmin;

        function generateId() {
            return 'ID-' + Math.floor(100000 + Math.random() * 900000);
        }

        function logActivity(action, details) {
            const logs = getData(STORAGE_KEYS.LOGS) || [];
            logs.unshift({
                id: generateId(),
                action,
                details,
                timestamp: new Date().toISOString()
            });
            saveData(STORAGE_KEYS.LOGS, logs.slice(0, 100)); // Keep last 100
        }

        // Initialize Default Demo Data
        function initDemoData(force = false) {
            if (!getData(STORAGE_KEYS.SETTINGS) || force) {
                saveData(STORAGE_KEYS.SETTINGS, defaultSettings);
            }

            if (!getData(STORAGE_KEYS.COMPANIES) || force) {
                const demoCompanies = [
                    { id: 'COMP-101', companyName: 'Al Modern Logistics Co.', arabicCompanyName: 'شركة الحديثة للخدمات اللوجستية', companyLicenseNumber: '7001234567', unifiedNumber: '7000111222', establishmentNumber: '1-123456', contactPerson: 'Ahmed Hassan', phone: '+966501234567', status: 'Active' },
                    { id: 'COMP-102', companyName: 'Saudi Builders Construction', arabicCompanyName: 'شركة البناءون السعوديون للمقاولات', companyLicenseNumber: '7009876543', unifiedNumber: '7000333444', establishmentNumber: '2-987654', contactPerson: 'Tariq Mansoor', phone: '+966507654321', status: 'Active' },
                    { id: 'COMP-103', companyName: 'Riyadh Tech Solutions', arabicCompanyName: 'حلول التقنية بالرياض', companyLicenseNumber: '7005554433', unifiedNumber: '7000555666', establishmentNumber: '3-555444', contactPerson: 'Sultan Khalid', phone: '+966509998877', status: 'Active' }
                ];
                saveData(STORAGE_KEYS.COMPANIES, demoCompanies);
            }

            if (!getData(STORAGE_KEYS.EMPLOYEES) || force) {
                const today = new Date();
                const addDays = (d, days) => new Date(d.getTime() + days * 86400000).toISOString().split('T')[0];

                const demoEmployees = [
                    { id: 'EMP-1001', employeeCode: '1001', fullName: 'Muhammad Ali Khan', arabicName: 'محمد علي خان', phone: '+966500112233', nationality: 'Pakistani', profession: 'Driver', joiningDate: '2023-01-15', iqamaNumber: '2410987654', idExpiryDate: addDays(today, -5), companyId: 'COMP-101', companyName: 'Al Modern Logistics Co.', companyLicenseNumber: '7001234567', unifiedNumber: '7000111222', establishmentNumber: '1-123456', qiwaSerialNumber: 'QW-99881', qiwaStatus: 'Active', employmentStatus: 'Active', monthlyFee: 350, archived: false },
                    { id: 'EMP-1002', employeeCode: '1002', fullName: 'Rahul Kumar Sharma', arabicName: 'راهول كومار شارما', phone: '+966500223344', nationality: 'Indian', profession: 'Electrician', joiningDate: '2023-03-20', iqamaNumber: '2410112233', idExpiryDate: addDays(today, 4), companyId: 'COMP-102', companyName: 'Saudi Builders Construction', companyLicenseNumber: '7009876543', unifiedNumber: '7000333444', establishmentNumber: '2-987654', qiwaSerialNumber: 'QW-99882', qiwaStatus: 'Active', employmentStatus: 'Active', monthlyFee: 350, archived: false },
                    { id: 'EMP-1003', employeeCode: '1003', fullName: 'John Mark Bautista', arabicName: 'جون مارك باتيستا', phone: '+966500334455', nationality: 'Filipino', profession: 'IT Technician', joiningDate: '2022-06-10', iqamaNumber: '2410445566', idExpiryDate: addDays(today, 25), companyId: 'COMP-103', companyName: 'Riyadh Tech Solutions', companyLicenseNumber: '7005554433', unifiedNumber: '7000555666', establishmentNumber: '3-555444', qiwaSerialNumber: 'QW-99883', qiwaStatus: 'Active', employmentStatus: 'Active', monthlyFee: 350, archived: false },
                    { id: 'EMP-1004', employeeCode: '1004', fullName: 'Tariq Mahmud', arabicName: 'طارق محمود', phone: '+966500445566', nationality: 'Bangladeshi', profession: 'Mason', joiningDate: '2023-08-01', iqamaNumber: '2410778899', idExpiryDate: addDays(today, 45), companyId: 'COMP-102', companyName: 'Saudi Builders Construction', companyLicenseNumber: '7009876543', unifiedNumber: '7000333444', establishmentNumber: '2-987654', qiwaSerialNumber: 'QW-99884', qiwaStatus: 'Active', employmentStatus: 'Transfer Pending', monthlyFee: 350, archived: false },
                    { id: 'EMP-1005', employeeCode: '1005', fullName: 'Youssef Ahmed Elsayed', arabicName: 'يوسف أحمد السيد', phone: '+966500556677', nationality: 'Egyptian', profession: 'Accountant', joiningDate: '2021-11-12', iqamaNumber: '2410001122', idExpiryDate: addDays(today, 120), companyId: 'COMP-101', companyName: 'Al Modern Logistics Co.', companyLicenseNumber: '7001234567', unifiedNumber: '7000111222', establishmentNumber: '1-123456', qiwaSerialNumber: 'QW-99885', qiwaStatus: 'Active', employmentStatus: 'Active', monthlyFee: 350, archived: false }
                ];
                saveData(STORAGE_KEYS.EMPLOYEES, demoEmployees);
            }

            if (!getData(STORAGE_KEYS.PAYMENTS) || force) {
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();

                const demoPayments = [
                    { id: 'PAY-2001', employeeId: 'EMP-1001', employeeName: 'Muhammad Ali Khan', companyId: 'COMP-101', companyName: 'Al Modern Logistics Co.', month: currentMonth, year: currentYear, expectedAmount: 350, paidAmount: 350, balance: 0, paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'Bank Transfer', referenceNumber: 'TRX-98123', status: 'PAID' },
                    { id: 'PAY-2002', employeeId: 'EMP-1002', employeeName: 'Rahul Kumar Sharma', companyId: 'COMP-102', companyName: 'Saudi Builders Construction', month: currentMonth, year: currentYear, expectedAmount: 350, paidAmount: 200, balance: 150, paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'Cash', referenceNumber: 'CSH-00192', status: 'PARTIAL' },
                    { id: 'PAY-2003', employeeId: 'EMP-1003', employeeName: 'John Mark Bautista', companyId: 'COMP-103', companyName: 'Riyadh Tech Solutions', month: currentMonth, year: currentYear, expectedAmount: 350, paidAmount: 0, balance: 350, paymentDate: '-', paymentMethod: '-', referenceNumber: '-', status: 'UNPAID' }
                ];
                saveData(STORAGE_KEYS.PAYMENTS, demoPayments);
            }
        }

        initDemoData();

        // ==========================================
        // STATE MANAGEMENT & CALCULATIONS
        // ==========================================
        let currentLang = localStorage.getItem(STORAGE_KEYS.LANG) || 'en';
        let currentPage = 'dashboard';

        function calculateIdStatus(expiryDateStr) {
            if (!expiryDateStr) return { status: 'Unknown', days: 0, badge: 'secondary' };
            const today = new Date();
            today.setHours(0,0,0,0);
            const exp = new Date(expiryDateStr);
            exp.setHours(0,0,0,0);
            
            const diffTime = exp - today;
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (days < 0) return { status: 'Expired', days, badge: 'danger' };
            if (days <= 7) return { status: 'Critical', days, badge: 'danger' };
            if (days <= 30) return { status: 'Warning', days, badge: 'warning' };
            if (days <= 60) return { status: 'Upcoming', days, badge: 'info' };
            return { status: 'Valid', days, badge: 'success' };
        }

        function getDynamicStats() {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            // Employee stats
            const totalEmployees = employees.length;
            const activeEmployees = employees.filter(e => e.employmentStatus === 'Active' && !e.archived).length;
            const transferPending = employees.filter(e => e.employmentStatus === 'Transfer Pending' && !e.archived).length;
            const transferred = employees.filter(e => e.employmentStatus === 'Transferred' && !e.archived).length;
            const finalExit = employees.filter(e => e.employmentStatus === 'Final Exit' && !e.archived).length;
            const inactive = employees.filter(e => e.employmentStatus === 'Inactive' || e.archived).length;

            // Monthly expected auto-calc: Active employees * fee
            const expectedMonthAmount = employees
                .filter(e => e.employmentStatus === 'Active' && !e.archived)
                .reduce((acc, e) => acc + (Number(e.monthlyFee) || 350), 0);

            // Payments stats for current month
            const currentMonthPayments = payments.filter(p => p.month == curMonth && p.year == curYear);
            const collectedAmount = currentMonthPayments.reduce((acc, p) => acc + (Number(p.paidAmount) || 0), 0);
            const outstandingAmount = Math.max(0, expectedMonthAmount - collectedAmount);

            const paidCount = currentMonthPayments.filter(p => p.status === 'PAID').length;
            const partialCount = currentMonthPayments.filter(p => p.status === 'PARTIAL').length;
            const unpaidCount = Math.max(0, activeEmployees - (paidCount + partialCount));

            // ID Expiry Counts
            let expiredIDs = 0, exp7Days = 0, exp30Days = 0, exp60Days = 0;
            employees.forEach(e => {
                if (e.archived) return;
                const calc = calculateIdStatus(e.idExpiryDate);
                if (calc.status === 'Expired') expiredIDs++;
                else if (calc.status === 'Critical') exp7Days++;
                else if (calc.status === 'Warning') exp30Days++;
                else if (calc.status === 'Upcoming') exp60Days++;
            });

            return {
                totalEmployees, activeEmployees, transferPending, transferred, finalExit, inactive,
                expectedMonthAmount, collectedAmount, outstandingAmount,
                paidCount, partialCount, unpaidCount,
                expiredIDs, exp7Days, exp30Days, exp60Days
            };
        }

        // ==========================================
        // UI & LANGUAGE SWITCHER
        // ==========================================
        function applyLanguage(lang) {
            currentLang = lang;
            localStorage.setItem(STORAGE_KEYS.LANG, lang);
            const htmlTag = document.documentElement;
            const switchBtnText = document.getElementById('langSwitchText');

            if (lang === 'ar') {
                htmlTag.setAttribute('dir', 'rtl');
                htmlTag.setAttribute('lang', 'ar');
                if (switchBtnText) switchBtnText.textContent = 'English';
            } else {
                htmlTag.setAttribute('dir', 'ltr');
                htmlTag.setAttribute('lang', 'en');
                if (switchBtnText) switchBtnText.textContent = 'العربية';
            }

            // Translate static nodes
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (i18n[lang][key]) el.textContent = i18n[lang][key];
            });

            document.querySelectorAll('[data-i18n-ph]').forEach(el => {
                const key = el.getAttribute('data-i18n-ph');
                if (i18n[lang][key]) el.setAttribute('placeholder', i18n[lang][key]);
            });

            // Update Header Business Name
            const settings = getData(STORAGE_KEYS.SETTINGS) || defaultSettings;
            document.querySelectorAll('.company-title').forEach(e => e.textContent = settings.businessName);

            // Re-render current page
            renderPage(currentPage);
        }

        function showToast(message, type = 'success') {
            const toastEl = document.getElementById('liveToast');
            const toastMsg = document.getElementById('toastMessage');
            toastMsg.textContent = message;
            toastEl.className = `toast align-items-center text-white bg-${type} border-0 shadow`;
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        }

        // ==========================================
        // ROUTER & RENDER ENGINE
        // ==========================================
        function navigateTo(page) {
            currentPage = page;
            document.querySelectorAll('.nav-link-custom').forEach(el => {
                if (el.getAttribute('data-page') === page) el.classList.add('active');
                else el.classList.remove('active');
            });
            renderPage(page);
        }

        function renderPage(page) {
            const container = document.getElementById('mainContent');
            container.className = "flex-grow-1 p-3 p-lg-4 fade-in";
            
            // Header date
            document.getElementById('currentDateText').textContent = new Date().toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

            switch(page) {
                case 'dashboard': renderDashboard(container); break;
                case 'employees': renderEmployees(container); break;
                case 'companies': renderCompanies(container); break;
                case 'payments': renderPayments(container); break;
                case 'payment-history': renderPaymentHistory(container); break;
                case 'id-expiry': renderIdExpiry(container); break;
                case 'reports': renderReports(container); break;
                case 'settings': renderSettings(container); break;
                default: renderDashboard(container);
            }
        }

        // ==========================================
        // PAGE RENDERERS
        // ==========================================

        // 1. DASHBOARD PAGE
        function renderDashboard(container) {
            const stats = getDynamicStats();
            
            container.innerHTML = `
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                    <div>
                        <h4 class="fw-bold mb-1">${currentLang === 'ar' ? 'لوحة التحكم المركزية' : 'Executive Dashboard'}</h4>
                        <p class="text-muted small mb-0">${currentLang === 'ar' ? 'نظام إدارة العمالة والدفعات الشهرية' : 'Employee & Monthly Payment Operations'}</p>
                    </div>
                    <button class="btn btn-primary btn-sm rounded-pill px-3" onclick="generateCurrentMonthPayments()">
                        <i class="bi bi-arrow-repeat me-1"></i> ${currentLang === 'ar' ? 'توليد استحقاقات الشهر الحالي' : 'Generate Current Month Payments'}
                    </button>
                </div>

                <!-- Quick Action Buttons -->
                <div class="row g-2 mb-4">
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-primary w-100 action-btn shadow-sm" onclick="openAddEmployeeModal()">
                            <i class="bi bi-person-plus-fill fs-5"></i><span class="small">${currentLang === 'ar' ? 'إضافة موظف' : 'Add Employee'}</span>
                        </button>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-dark w-100 action-btn shadow-sm" onclick="openAddCompanyModal()">
                            <i class="bi bi-building-add fs-5"></i><span class="small">${currentLang === 'ar' ? 'إضافة شركة' : 'Add Company'}</span>
                        </button>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-success w-100 action-btn shadow-sm" onclick="openRecordPaymentModal()">
                            <i class="bi bi-credit-card-plus fs-5"></i><span class="small">${currentLang === 'ar' ? 'تسجيل دفعة' : 'Record Payment'}</span>
                        </button>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-outline-danger w-100 action-btn shadow-sm bg-white" onclick="navigateTo('payments')">
                            <i class="bi bi-exclamation-circle-fill fs-5"></i><span class="small">${currentLang === 'ar' ? 'عرض الغير مدفوع' : 'View Unpaid'}</span>
                        </button>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-outline-warning text-dark w-100 action-btn shadow-sm bg-white" onclick="navigateTo('id-expiry')">
                            <i class="bi bi-card-checklist fs-5"></i><span class="small">${currentLang === 'ar' ? 'إقامات تنتهي' : 'Expiring IDs'}</span>
                        </button>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <button class="btn btn-outline-secondary w-100 action-btn shadow-sm bg-white" onclick="navigateTo('reports')">
                            <i class="bi bi-bar-chart-line-fill fs-5"></i><span class="small">${currentLang === 'ar' ? 'التقارير' : 'Reports'}</span>
                        </button>
                    </div>
                </div>

                <!-- Summary Employee Cards -->
                <h6 class="fw-bold mb-3"><i class="bi bi-people me-2"></i>${currentLang === 'ar' ? 'ملخص حالات الموظفين' : 'Employee Status Summary'}</h6>
                <div class="row g-3 mb-4">
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-primary border-4">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                            <span class="fs-4 fw-bold text-dark">${stats.totalEmployees}</span>
                        </div>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-success border-4">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'نشط' : 'Active'}</span>
                            <span class="fs-4 fw-bold text-success">${stats.activeEmployees}</span>
                        </div>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-warning border-4">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'نقل قيد الانتظار' : 'Transfer Pending'}</span>
                            <span class="fs-4 fw-bold text-warning">${stats.transferPending}</span>
                        </div>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-info border-4">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'منقول' : 'Transferred'}</span>
                            <span class="fs-4 fw-bold text-info">${stats.transferred}</span>
                        </div>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-purple border-4" style="border-color:#8b5cf6!important;">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'خروج نهائي' : 'Final Exit'}</span>
                            <span class="fs-4 fw-bold" style="color:#8b5cf6;">${stats.finalExit}</span>
                        </div>
                    </div>
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="dashboard-card p-3 border-start border-secondary border-4">
                            <span class="text-muted small d-block">${currentLang === 'ar' ? 'غير نشط' : 'Inactive'}</span>
                            <span class="fs-4 fw-bold text-secondary">${stats.inactive}</span>
                        </div>
                    </div>
                </div>

                <!-- Financial Stats -->
                <h6 class="fw-bold mb-3"><i class="bi bi-wallet2 me-2"></i>${currentLang === 'ar' ? 'الوضع المالي للشهر الحالي' : 'Current Month Financial Metrics'}</h6>
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                        <div class="dashboard-card p-3 bg-light">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <span class="text-muted small d-block">${currentLang === 'ar' ? 'المبلغ المتوقع' : 'Expected Amount'}</span>
                                    <h4 class="fw-bold mb-0 text-dark">${stats.expectedMonthAmount.toLocaleString()} SAR</h4>
                                </div>
                                <i class="bi bi-calculator text-primary fs-2"></i>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="dashboard-card p-3 bg-light">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <span class="text-muted small d-block">${currentLang === 'ar' ? 'المبلغ المحصل' : 'Collected Amount'}</span>
                                    <h4 class="fw-bold mb-0 text-success">${stats.collectedAmount.toLocaleString()} SAR</h4>
                                </div>
                                <i class="bi bi-cash-coin text-success fs-2"></i>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="dashboard-card p-3 bg-light">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <span class="text-muted small d-block">${currentLang === 'ar' ? 'المتبقي المتاخر' : 'Outstanding Balance'}</span>
                                    <h4 class="fw-bold mb-0 text-danger">${stats.outstandingAmount.toLocaleString()} SAR</h4>
                                </div>
                                <i class="bi bi-exclamation-triangle text-danger fs-2"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ID Expiry Alert Cards -->
                <div class="row g-3 mb-4">
                    <div class="col-6 col-md-3">
                        <div class="dashboard-card p-3 text-center border-danger">
                            <span class="badge bg-danger mb-1">${currentLang === 'ar' ? 'منتهية' : 'Expired'}</span>
                            <h3 class="fw-bold text-danger mb-0">${stats.expiredIDs}</h3>
                        </div>
                    </div>
                    <div class="col-6 col-md-3">
                        <div class="dashboard-card p-3 text-center border-danger">
                            <span class="badge bg-danger mb-1">${currentLang === 'ar' ? 'خلال 7 أيام' : 'Within 7 Days'}</span>
                            <h3 class="fw-bold text-danger mb-0">${stats.exp7Days}</h3>
                        </div>
                    </div>
                    <div class="col-6 col-md-3">
                        <div class="dashboard-card p-3 text-center border-warning">
                            <span class="badge bg-warning text-dark mb-1">${currentLang === 'ar' ? 'خلال 30 يوم' : 'Within 30 Days'}</span>
                            <h3 class="fw-bold text-warning mb-0">${stats.exp30Days}</h3>
                        </div>
                    </div>
                    <div class="col-6 col-md-3">
                        <div class="dashboard-card p-3 text-center border-info">
                            <span class="badge bg-info text-dark mb-1">${currentLang === 'ar' ? 'خلال 60 يوم' : 'Within 60 Days'}</span>
                            <h3 class="fw-bold text-info mb-0">${stats.exp60Days}</h3>
                        </div>
                    </div>
                </div>

                <!-- Dashboard Charts -->
                <div class="row g-3">
                    <div class="col-lg-8">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3">${currentLang === 'ar' ? 'تحليل التحصيل المالي' : 'Monthly Collection Analytics'}</h6>
                            <canvas id="chartFinancials" height="120"></canvas>
                        </div>
                    </div>
                    <div class="col-lg-4">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3">${currentLang === 'ar' ? 'توزيع حالات الموظفين' : 'Employee Distribution'}</h6>
                            <canvas id="chartEmployeeStatus" height="250"></canvas>
                        </div>
                    </div>
                </div>
            `;

            // Initialize Charts
            setTimeout(() => initDashboardCharts(stats), 50);
        }

        function initDashboardCharts(stats) {
            const ctxFin = document.getElementById('chartFinancials');
            if (ctxFin) {
                new Chart(ctxFin, {
                    type: 'bar',
                    data: {
                        labels: [currentLang === 'ar' ? 'المتوقع' : 'Expected', currentLang === 'ar' ? 'المحصل' : 'Collected', currentLang === 'ar' ? 'المتبقي' : 'Outstanding'],
                        datasets: [{
                            label: 'SAR',
                            data: [stats.expectedMonthAmount, stats.collectedAmount, stats.outstandingAmount],
                            backgroundColor: ['#0d6efd', '#198754', '#dc3545'],
                            borderRadius: 6
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } } }
                });
            }

            const ctxEmp = document.getElementById('chartEmployeeStatus');
            if (ctxEmp) {
                new Chart(ctxEmp, {
                    type: 'doughnut',
                    data: {
                        labels: ['Active', 'Pending', 'Transferred', 'Exit', 'Inactive'],
                        datasets: [{
                            data: [stats.activeEmployees, stats.transferPending, stats.transferred, stats.finalExit, stats.inactive],
                            backgroundColor: ['#198754', '#ffc107', '#0dcaf0', '#8b5cf6', '#6c757d']
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
                });
            }
        }

        // 2. EMPLOYEES PAGE
        function renderEmployees(container) {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];

            container.innerHTML = `
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 gap-2">
                    <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'إدارة الموظفين' : 'Employee Directory'}</h4>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm" onclick="exportDataCSV('employees')"><i class="bi bi-download me-1"></i> Export CSV</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteAllEmployees()"><i class="bi bi-trash3 me-1"></i> Delete All</button>
                        <button class="btn btn-primary btn-sm" onclick="openAddEmployeeModal()"><i class="bi bi-plus-lg me-1"></i> ${currentLang === 'ar' ? 'إضافة موظف' : 'Add Employee'}</button>
                    </div>
                </div>

                <!-- Filters -->
                <div class="dashboard-card p-3 mb-3">
                    <div class="row g-2">
                        <div class="col-md-4">
                            <input type="text" id="empSearchInput" class="form-control form-control-sm" placeholder="Search ID, Name, Iqama, Phone..." onkeyup="filterEmployeesTable()">
                        </div>
                        <div class="col-md-2">
                            <select id="empStatusFilter" class="form-select form-select-sm" onchange="filterEmployeesTable()">
                                <option value="">All Statuses</option>
                                <option value="Active">Active</option>
                                <option value="Transfer Pending">Transfer Pending</option>
                                <option value="Transferred">Transferred</option>
                                <option value="Final Exit">Final Exit</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <select id="empCompanyFilter" class="form-select form-select-sm" onchange="filterEmployeesTable()">
                                <option value="">All Companies</option>
                                ${companies.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <select id="empIdStatusFilter" class="form-select form-select-sm" onchange="filterEmployeesTable()">
                                <option value="">All ID Expiry Statuses</option>
                                <option value="Expired">Expired</option>
                                <option value="Critical">Critical (0-7 Days)</option>
                                <option value="Warning">Warning (8-30 Days)</option>
                                <option value="Valid">Valid (60+ Days)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Employees Table -->
                <div class="dashboard-card overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" id="employeesTable">
                            <thead class="table-light">
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Iqama / ID</th>
                                    <th>Company</th>
                                    <th>Profession</th>
                                    <th>ID Expiry</th>
                                    <th>Fee</th>
                                    <th>Status</th>
                                    <th class="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderEmployeeRows(employees)}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        function renderEmployeeRows(employees) {
            if (employees.length === 0) {
                return `<tr><td colspan="9" class="text-center py-4 text-muted">No employees found.</td></tr>`;
            }

            return employees.map(e => {
                const idCalc = calculateIdStatus(e.idExpiryDate);
                return `
                    <tr class="${e.archived ? 'table-secondary' : ''}">
                        <td class="fw-bold">${e.employeeCode || e.id}</td>
                        <td>
                            <div class="fw-semibold">${e.fullName}</div>
                            <small class="text-muted">${e.arabicName || ''}</small>
                        </td>
                        <td>
                            <div>${e.iqamaNumber}</div>
                            <small class="text-muted">${e.phone}</small>
                        </td>
                        <td><small>${e.companyName || '-'}</small></td>
                        <td><small>${e.profession}</small></td>
                        <td>
                            <span class="badge bg-${idCalc.badge}">${idCalc.status} (${idCalc.days}d)</span>
                            <div class="small text-muted" style="font-size:11px;">${e.idExpiryDate || '-'}</div>
                        </td>
                        <td class="fw-semibold">${e.monthlyFee || 350} SAR</td>
                        <td><span class="badge badge-${e.employmentStatus.toLowerCase().replace(' ', '-')}">${e.employmentStatus}</span></td>
                        <td class="text-end">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="viewEmployeeDetails('${e.id}')" title="View"><i class="bi bi-eye"></i></button>
                                <button class="btn btn-outline-secondary" onclick="openEditEmployeeModal('${e.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
                                <button class="btn btn-outline-danger" onclick="archiveEmployee('${e.id}')" title="Archive"><i class="bi bi-archive"></i></button>
                                <button class="btn btn-danger" onclick="deleteEmployee('${e.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function filterEmployeesTable() {
            const search = document.getElementById('empSearchInput').value.toLowerCase();
            const status = document.getElementById('empStatusFilter').value;
            const companyId = document.getElementById('empCompanyFilter').value;
            const idStatus = document.getElementById('empIdStatusFilter').value;

            let employees = getData(STORAGE_KEYS.EMPLOYEES) || [];

            employees = employees.filter(e => {
                const matchesSearch = e.fullName.toLowerCase().includes(search) || 
                                      (e.arabicName && e.arabicName.toLowerCase().includes(search)) ||
                                      e.iqamaNumber.includes(search) ||
                                      e.phone.includes(search) ||
                                      (e.employeeCode && e.employeeCode.includes(search));
                const matchesStatus = !status || e.employmentStatus === status;
                const matchesCompany = !companyId || e.companyId === companyId;
                
                const calc = calculateIdStatus(e.idExpiryDate);
                const matchesIdStatus = !idStatus || calc.status === idStatus;

                return matchesSearch && matchesStatus && matchesCompany && matchesIdStatus;
            });

            document.querySelector('#employeesTable tbody').innerHTML = renderEmployeeRows(employees);
        }

        // 3. COMPANIES PAGE
        function renderCompanies(container) {
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'إدارة الشركات' : 'Company Management'}</h4>
                    <button class="btn btn-danger btn-sm" onclick="deleteAllCompanies()"><i class="bi bi-trash3 me-1"></i> Delete All</button>
                    <button class="btn btn-primary btn-sm" onclick="openAddCompanyModal()"><i class="bi bi-plus-lg me-1"></i> Add Company</button>
                </div>

                <div class="row g-3">
                    ${companies.map(c => {
                        const companyEmp = employees.filter(e => e.companyId === c.id);
                        const activeCount = companyEmp.filter(e => e.employmentStatus === 'Active').length;
                        return `
                            <div class="col-md-6 col-lg-4">
                                <div class="dashboard-card p-3 h-100 d-flex flex-column justify-content-between">
                                    <div>
                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                            <div>
                                                <h5 class="fw-bold mb-0">${c.companyName}</h5>
                                                <small class="text-muted">${c.arabicCompanyName || ''}</small>
                                            </div>
                                            <span class="badge bg-success">${c.status}</span>
                                        </div>
                                        <hr class="my-2 text-muted">
                                        <div class="small text-muted mb-1"><strong>License:</strong> ${c.companyLicenseNumber}</div>
                                        <div class="small text-muted mb-1"><strong>Unified No:</strong> ${c.unifiedNumber}</div>
                                        <div class="small text-muted mb-1"><strong>Est. No:</strong> ${c.establishmentNumber || '-'}</div>
                                        <div class="small text-muted mb-3"><strong>Contact:</strong> ${c.contactPerson} (${c.phone})</div>
                                    </div>
                                    <div>
                                        <div class="bg-light p-2 rounded mb-3 d-flex justify-content-between text-center small">
                                            <div><span class="d-block text-muted">Total</span><strong>${companyEmp.length}</strong></div>
                                            <div><span class="d-block text-muted">Active</span><strong class="text-success">${activeCount}</strong></div>
                                            <div><span class="d-block text-muted">Monthly</span><strong>${activeCount * 350} SAR</strong></div>
                                        </div>
                                        <div class="d-flex gap-2">
                                            <button class="btn btn-outline-primary btn-sm w-100" onclick="viewCompanyDetails('${c.id}')">View Details</button>
                                            <button class="btn btn-outline-secondary btn-sm" onclick="openEditCompanyModal('${c.id}')"><i class="bi bi-pencil"></i></button>
                                            <button class="btn btn-outline-danger btn-sm" onclick="deleteCompany('${c.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // 4. MONTHLY PAYMENTS PAGE
        function renderPayments(container) {
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'الدفعات الشهرية' : 'Monthly Payment Register'}</h4>
                        <span class="text-muted small">Period: ${curMonth}/${curYear}</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-danger btn-sm" onclick="deleteAllPayments()"><i class="bi bi-trash3 me-1"></i> Delete All</button>
                        <button class="btn btn-success btn-sm" onclick="openRecordPaymentModal()"><i class="bi bi-cash-stack me-1"></i> Record Payment</button>
                    </div>
                </div>

                <div class="dashboard-card overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Employee</th>
                                    <th>Company</th>
                                    <th>Period</th>
                                    <th>Expected</th>
                                    <th>Paid</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th class="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payments.length === 0 ? '<tr><td colspan="9" class="text-center py-4 text-muted">No monthly payments recorded.</td></tr>' : ''}
                                ${payments.map(p => `
                                    <tr>
                                        <td class="fw-semibold">${p.employeeName}</td>
                                        <td><small>${p.companyName}</small></td>
                                        <td>${p.month}/${p.year}</td>
                                        <td>${p.expectedAmount} SAR</td>
                                        <td class="text-success fw-bold">${p.paidAmount} SAR</td>
                                        <td class="text-danger fw-bold">${p.balance} SAR</td>
                                        <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
                                        <td><small>${p.paymentDate}</small></td>
                                        <td class="text-end">
                                            <button class="btn btn-sm btn-outline-primary me-1" onclick="openRecordPaymentModal('${p.employeeId}')">Pay</button>
                                            <button class="btn btn-sm btn-outline-dark" onclick="printReceipt('${p.id}')"><i class="bi bi-printer"></i></button>
                                            <button class="btn btn-sm btn-outline-danger" onclick="deletePayment('${p.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // 5. PAYMENT HISTORY PAGE
        function renderPaymentHistory(container) {
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'سجل الدفعات التاريخي' : 'Complete Payment History'}</h4>
                    <button class="btn btn-outline-secondary btn-sm" onclick="exportDataCSV('payments')"><i class="bi bi-download me-1"></i> Export History CSV</button>
                </div>

                <div class="dashboard-card p-3 mb-3">
                    <input type="text" id="historySearch" class="form-control form-control-sm" placeholder="Filter by employee name, reference number or company..." onkeyup="filterHistoryTable()">
                </div>

                <div class="dashboard-card overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover align-middle mb-0" id="historyTable">
                            <thead class="table-light">
                                <tr>
                                    <th>Receipt Ref</th>
                                    <th>Employee</th>
                                    <th>Month/Year</th>
                                    <th>Method</th>
                                    <th>Paid Amount</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th class="text-end">Receipt</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payments.map(p => `
                                    <tr>
                                        <td><code>${p.referenceNumber || p.id}</code></td>
                                        <td class="fw-semibold">${p.employeeName}</td>
                                        <td>${p.month}/${p.year}</td>
                                        <td><span class="badge bg-light text-dark border">${p.paymentMethod}</span></td>
                                        <td class="text-success fw-bold">${p.paidAmount} SAR</td>
                                        <td>${p.paymentDate}</td>
                                        <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
                                        <td class="text-end">
                                            <button class="btn btn-sm btn-light border" onclick="printReceipt('${p.id}')"><i class="bi bi-printer"></i> Print</button>
                                            <button class="btn btn-sm btn-outline-danger" onclick="deletePayment('${p.id}')"><i class="bi bi-trash3"></i> Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        function filterHistoryTable() {
            const query = document.getElementById('historySearch').value.toLowerCase();
            const rows = document.querySelectorAll('#historyTable tbody tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        }

        // 6. ID EXPIRY PAGE
        function renderIdExpiry(container) {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];

            container.innerHTML = `
                <div class="mb-3">
                    <h4 class="fw-bold mb-1">${currentLang === 'ar' ? 'متابعة صلاحية الإقامات' : 'Iqama / ID Expiry Control'}</h4>
                    <p class="text-muted small">Automated tracking for expired and upcoming ID renewals.</p>
                </div>

                <ul class="nav nav-pills mb-3" id="expiryTabs">
                    <li class="nav-item"><button class="nav-link active" onclick="filterExpiry('All')">All</button></li>
                    <li class="nav-item"><button class="nav-link text-danger" onclick="filterExpiry('Expired')">Expired</button></li>
                    <li class="nav-item"><button class="nav-link text-danger" onclick="filterExpiry('Critical')">0-7 Days</button></li>
                    <li class="nav-item"><button class="nav-link text-warning" onclick="filterExpiry('Warning')">8-30 Days</button></li>
                    <li class="nav-item"><button class="nav-link text-info" onclick="filterExpiry('Upcoming')">31-60 Days</button></li>
                </ul>

                <div class="dashboard-card overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" id="expiryTable">
                            <thead class="table-light">
                                <tr>
                                    <th>Employee</th>
                                    <th>Iqama No.</th>
                                    <th>Company</th>
                                    <th>Expiry Date</th>
                                    <th>Days Remaining</th>
                                    <th>ID Status</th>
                                    <th class="text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderExpiryRows(employees, 'All')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        function renderExpiryRows(employees, filter) {
            const filtered = employees.filter(e => {
                if (e.archived) return false;
                const calc = calculateIdStatus(e.idExpiryDate);
                if (filter === 'All') return true;
                return calc.status === filter;
            });

            if (filtered.length === 0) return `<tr><td colspan="7" class="text-center py-4 text-muted">No records match this filter.</td></tr>`;

            return filtered.map(e => {
                const calc = calculateIdStatus(e.idExpiryDate);
                return `
                    <tr>
                        <td><strong>${e.fullName}</strong><div class="small text-muted">${e.phone}</div></td>
                        <td><code>${e.iqamaNumber}</code></td>
                        <td><small>${e.companyName}</small></td>
                        <td>${e.idExpiryDate}</td>
                        <td class="fw-bold">${calc.days} days</td>
                        <td><span class="badge bg-${calc.badge}">${calc.status}</span></td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-primary" onclick="openEditEmployeeModal('${e.id}')">Update Expiry</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function filterExpiry(filter) {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            document.querySelectorAll('#expiryTabs .nav-link').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            document.querySelector('#expiryTable tbody').innerHTML = renderExpiryRows(employees, filter);
        }

        // 7. REPORTS PAGE
        function renderReports(container) {
            const stats = getDynamicStats();

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'التقارير والكشوفات' : 'System Reports & Financial Audits'}</h4>
                    <button class="btn btn-primary btn-sm" onclick="window.print()"><i class="bi bi-printer me-1"></i> Print Summary Report</button>
                </div>

                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3 border-bottom pb-2">Financial Summary Report</h6>
                            <div class="d-flex justify-content-between py-1"><span>Total Expected:</span><strong>${stats.expectedMonthAmount} SAR</strong></div>
                            <div class="d-flex justify-content-between py-1 text-success"><span>Total Collected:</span><strong>${stats.collectedAmount} SAR</strong></div>
                            <div class="d-flex justify-content-between py-1 text-danger"><span>Total Outstanding:</span><strong>${stats.outstandingAmount} SAR</strong></div>
                            <button class="btn btn-outline-secondary btn-sm w-100 mt-3" onclick="exportDataCSV('payments')">Export Financial CSV</button>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3 border-bottom pb-2">Employee Headcount Report</h6>
                            <div class="d-flex justify-content-between py-1"><span>Active Workforce:</span><strong>${stats.activeEmployees}</strong></div>
                            <div class="d-flex justify-content-between py-1"><span>Transferred Out:</span><strong>${stats.transferred}</strong></div>
                            <div class="d-flex justify-content-between py-1"><span>Final Exit Executed:</span><strong>${stats.finalExit}</strong></div>
                            <button class="btn btn-outline-secondary btn-sm w-100 mt-3" onclick="exportDataCSV('employees')">Export Employees CSV</button>
                        </div>
                    </div>
                </div>
            `;
        }

        // 8. SETTINGS PAGE
        function renderSettings(container) {
            const settings = getData(STORAGE_KEYS.SETTINGS) || defaultSettings;

            container.innerHTML = `
                <h4 class="fw-bold mb-3">${currentLang === 'ar' ? 'إعدادات النظام والنسخ الاحتياطي' : 'System Configuration & Data Backup'}</h4>
                
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3">General Settings</h6>
                            <form id="settingsForm" onsubmit="saveSystemSettings(event)">
                                <div class="mb-3">
                                    <label class="form-label small fw-semibold">Business Name</label>
                                    <input type="text" id="setBusinessName" class="form-control" value="${settings.businessName}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-semibold">Default Monthly Fee (SAR)</label>
                                    <input type="number" id="setDefaultFee" class="form-control" value="${settings.defaultFee}" required>
                                </div>
                                <button type="submit" class="btn btn-primary btn-sm">Save Configuration</button>
                            </form>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="dashboard-card p-3">
                            <h6 class="fw-bold mb-3">Backup & Data Restore</h6>
                            <p class="text-muted small">Export all system database records to a JSON file or restore from a previous backup.</p>
                            
                            <div class="d-flex gap-2 mb-3">
                                <button class="btn btn-success btn-sm w-100" onclick="exportBackupJSON()"><i class="bi bi-download me-1"></i> Export Backup JSON</button>
                            </div>
                            <hr>
                            <label class="form-label small fw-semibold">Restore Data</label>
                            <input type="file" id="restoreFileInput" class="form-control form-control-sm mb-2" accept=".json">
                            <button class="btn btn-danger btn-sm w-100" onclick="restoreBackupJSON()"><i class="bi bi-upload me-1"></i> Restore & Overwrite</button>
                        </div>
                    </div>
                </div>
            `;
        }

        // ==========================================
        // MODALS & CRUD OPERATIONS
        // ==========================================

        function openModal(title, bodyHTML) {
            const content = document.getElementById('appModalContent');
            content.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title fw-bold">${title}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">${bodyHTML}</div>
            `;
            const modal = new bootstrap.Modal(document.getElementById('appModal'));
            modal.show();
        }

        function closeModal() {
            const modalEl = document.getElementById('appModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        // Add/Edit Employee Modal
        function openAddEmployeeModal(editId = null) {
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            let emp = {
                employeeCode: '', fullName: '', arabicName: '', phone: '', nationality: 'Pakistani',
                profession: 'Worker', joiningDate: new Date().toISOString().split('T')[0], iqamaNumber: '',
                idExpiryDate: '', companyId: companies[0]?.id || '', monthlyFee: 350, employmentStatus: 'Active'
            };

            if (editId) {
                const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
                emp = employees.find(e => e.id === editId) || emp;
            }

            const bodyHTML = `
                <form onsubmit="saveEmployeeForm(event, '${editId || ''}')">
                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Full Name (English)</label>
                            <input type="text" id="mEmpName" class="form-control form-control-sm" value="${emp.fullName}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Arabic Name</label>
                            <input type="text" id="mEmpNameAr" class="form-control form-control-sm" value="${emp.arabicName || ''}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Iqama / ID Number</label>
                            <input type="text" id="mEmpIqama" class="form-control form-control-sm" value="${emp.iqamaNumber}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Iqama Expiry Date</label>
                            <input type="date" id="mEmpExpiry" class="form-control form-control-sm" value="${emp.idExpiryDate}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Phone Number</label>
                            <input type="text" id="mEmpPhone" class="form-control form-control-sm" value="${emp.phone}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Assigned Company</label>
                            <select id="mEmpCompany" class="form-select form-select-sm" required>
                                ${companies.map(c => `<option value="${c.id}" ${c.id === emp.companyId ? 'selected' : ''}>${c.companyName}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Profession</label>
                            <input type="text" id="mEmpProfession" class="form-control form-control-sm" value="${emp.profession}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Monthly Fee (SAR)</label>
                            <input type="number" id="mEmpFee" class="form-control form-control-sm" value="${emp.monthlyFee}" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Employment Status</label>
                            <select id="mEmpStatus" class="form-select form-select-sm">
                                <option value="Active" ${emp.employmentStatus === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="Transfer Pending" ${emp.employmentStatus === 'Transfer Pending' ? 'selected' : ''}>Transfer Pending</option>
                                <option value="Transferred" ${emp.employmentStatus === 'Transferred' ? 'selected' : ''}>Transferred</option>
                                <option value="Final Exit" ${emp.employmentStatus === 'Final Exit' ? 'selected' : ''}>Final Exit</option>
                                <option value="Inactive" ${emp.employmentStatus === 'Inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-3 text-end">
                        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" class="btn btn-primary btn-sm">Save Employee</button>
                    </div>
                </form>
            `;

            openModal(editId ? 'Edit Employee' : 'Add New Employee', bodyHTML);
        }

        function openEditEmployeeModal(id) {
            openAddEmployeeModal(id);
        }

        function saveEmployeeForm(e, editId) {
            e.preventDefault();
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            
            const companyId = document.getElementById('mEmpCompany').value;
            const company = companies.find(c => c.id === companyId);

            const newEmp = {
                id: editId || generateId(),
                employeeCode: editId ? (employees.find(x => x.id === editId)?.employeeCode || '1000') : Math.floor(1000 + Math.random() * 9000).toString(),
                fullName: document.getElementById('mEmpName').value,
                arabicName: document.getElementById('mEmpNameAr').value,
                iqamaNumber: document.getElementById('mEmpIqama').value,
                idExpiryDate: document.getElementById('mEmpExpiry').value,
                phone: document.getElementById('mEmpPhone').value,
                companyId: companyId,
                companyName: company ? company.companyName : '-',
                profession: document.getElementById('mEmpProfession').value,
                monthlyFee: Number(document.getElementById('mEmpFee').value) || 350,
                employmentStatus: document.getElementById('mEmpStatus').value,
                archived: false,
                createdAt: new Date().toISOString()
            };

            if (editId) {
                const index = employees.findIndex(x => x.id === editId);
                if (index !== -1) employees[index] = { ...employees[index], ...newEmp };
            } else {
                employees.unshift(newEmp);
            }

            saveData(STORAGE_KEYS.EMPLOYEES, employees);
            logActivity('Save Employee', `Employee ${newEmp.fullName} saved.`);
            closeModal();
            showToast('Employee saved successfully.');
            renderPage(currentPage);
        }

        function archiveEmployee(id) {
            if (confirm('Are you sure you want to archive this employee? All payment histories will be preserved.')) {
                const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
                const emp = employees.find(e => e.id === id);
                if (emp) {
                    emp.archived = true;
                    emp.employmentStatus = 'Inactive';
                    saveData(STORAGE_KEYS.EMPLOYEES, employees);
                    showToast('Employee archived.', 'warning');
                    renderPage(currentPage);
                }
            }
        }

        // View Employee Details
        function viewEmployeeDetails(id) {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const emp = employees.find(e => e.id === id);
            if (!emp) return;

            const idCalc = calculateIdStatus(emp.idExpiryDate);

            const bodyHTML = `
                <div class="p-2">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <h4 class="fw-bold mb-0">${emp.fullName}</h4>
                            <span class="text-muted">${emp.arabicName || ''}</span>
                        </div>
                        <span class="badge badge-${emp.employmentStatus.toLowerCase().replace(' ', '-')} fs-6">${emp.employmentStatus}</span>
                    </div>
                    <div class="row g-2 mb-3 bg-light p-2 rounded">
                        <div class="col-6"><strong>Code:</strong> ${emp.employeeCode}</div>
                        <div class="col-6"><strong>Iqama:</strong> ${emp.iqamaNumber}</div>
                        <div class="col-6"><strong>Phone:</strong> ${emp.phone}</div>
                        <div class="col-6"><strong>Company:</strong> ${emp.companyName}</div>
                        <div class="col-6"><strong>ID Expiry:</strong> ${emp.idExpiryDate} <span class="badge bg-${idCalc.badge} ms-1">${idCalc.status}</span></div>
                        <div class="col-6"><strong>Monthly Fee:</strong> ${emp.monthlyFee} SAR</div>
                    </div>
                </div>
            `;
            openModal('Employee Details', bodyHTML);
        }

        // Company Modal
        function openAddCompanyModal(editId = null) {
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            let comp = { companyName: '', arabicCompanyName: '', companyLicenseNumber: '', unifiedNumber: '', establishmentNumber: '', contactPerson: '', phone: '' };

            if (editId) {
                comp = companies.find(c => c.id === editId) || comp;
            }

            const bodyHTML = `
                <form onsubmit="saveCompanyForm(event, '${editId || ''}')">
                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Company Name</label>
                            <input type="text" id="mCompName" class="form-control form-control-sm" value="${comp.companyName}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Arabic Company Name</label>
                            <input type="text" id="mCompNameAr" class="form-control form-control-sm" value="${comp.arabicCompanyName || ''}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">License Number</label>
                            <input type="text" id="mCompLicense" class="form-control form-control-sm" value="${comp.companyLicenseNumber}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Unified Number</label>
                            <input type="text" id="mCompUnified" class="form-control form-control-sm" value="${comp.unifiedNumber}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Contact Person</label>
                            <input type="text" id="mCompContact" class="form-control form-control-sm" value="${comp.contactPerson}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Contact Phone</label>
                            <input type="text" id="mCompPhone" class="form-control form-control-sm" value="${comp.phone}" required>
                        </div>
                    </div>
                    <div class="mt-3 text-end">
                        <button type="submit" class="btn btn-primary btn-sm">Save Company</button>
                    </div>
                </form>
            `;
            openModal(editId ? 'Edit Company' : 'Add Company', bodyHTML);
        }

        function openEditCompanyModal(id) {
            openAddCompanyModal(id);
        }

        function saveCompanyForm(e, editId) {
            e.preventDefault();
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];

            const newComp = {
                id: editId || generateId(),
                companyName: document.getElementById('mCompName').value,
                arabicCompanyName: document.getElementById('mCompNameAr').value,
                companyLicenseNumber: document.getElementById('mCompLicense').value,
                unifiedNumber: document.getElementById('mCompUnified').value,
                contactPerson: document.getElementById('mCompContact').value,
                phone: document.getElementById('mCompPhone').value,
                status: 'Active'
            };

            if (editId) {
                const idx = companies.findIndex(c => c.id === editId);
                if (idx !== -1) companies[idx] = newComp;
            } else {
                companies.push(newComp);
            }

            saveData(STORAGE_KEYS.COMPANIES, companies);
            closeModal();
            showToast('Company saved.');
            renderPage(currentPage);
        }

        // Record Payment Modal
        function openRecordPaymentModal(empId = null) {
            const employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => !e.archived);
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            const selectedEmp = empId ? employees.find(e => e.id === empId) : employees[0];

            const bodyHTML = `
                <form onsubmit="savePaymentForm(event)">
                    <div class="row g-2">
                        <div class="col-md-12">
                            <label class="form-label small fw-bold">Select Employee</label>
                            <select id="mPayEmp" class="form-select form-select-sm" onchange="updatePaymentModalFee()" required>
                                ${employees.map(e => `<option value="${e.id}" data-fee="${e.monthlyFee || 350}" ${e.id === empId ? 'selected' : ''}>${e.fullName} (${e.iqamaNumber})</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small fw-bold">Month</label>
                            <input type="number" id="mPayMonth" class="form-control form-control-sm" value="${curMonth}" min="1" max="12" required>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small fw-bold">Year</label>
                            <input type="number" id="mPayYear" class="form-control form-control-sm" value="${curYear}" required>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small fw-bold">Expected Fee</label>
                            <input type="number" id="mPayExpected" class="form-control form-control-sm" value="${selectedEmp ? selectedEmp.monthlyFee : 350}" readonly>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small fw-bold">Paid Amount (SAR)</label>
                            <input type="number" id="mPayPaid" class="form-control form-control-sm" value="${selectedEmp ? selectedEmp.monthlyFee : 350}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Payment Method</label>
                            <select id="mPayMethod" class="form-select form-select-sm">
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Reference Number</label>
                            <input type="text" id="mPayRef" class="form-control form-control-sm" value="TRX-${Math.floor(10000 + Math.random()*90000)}">
                        </div>
                    </div>
                    <div class="mt-3 text-end">
                        <button type="submit" class="btn btn-success btn-sm">Record & Generate Receipt</button>
                    </div>
                </form>
            `;
            openModal('Record Monthly Payment', bodyHTML);
        }

        function updatePaymentModalFee() {
            const select = document.getElementById('mPayEmp');
            const fee = select.options[select.selectedIndex].getAttribute('data-fee');
            document.getElementById('mPayExpected').value = fee;
            document.getElementById('mPayPaid').value = fee;
        }

        function savePaymentForm(e) {
            e.preventDefault();
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];

            const empId = document.getElementById('mPayEmp').value;
            const emp = employees.find(x => x.id === empId);

            const expected = Number(document.getElementById('mPayExpected').value);
            const paid = Number(document.getElementById('mPayPaid').value);
            const balance = Math.max(0, expected - paid);

            let status = 'UNPAID';
            if (paid >= expected) status = 'PAID';
            else if (paid > 0) status = 'PARTIAL';

            const newPay = {
                id: generateId(),
                employeeId: empId,
                employeeName: emp ? emp.fullName : 'Employee',
                companyId: emp ? emp.companyId : '',
                companyName: emp ? emp.companyName : '',
                month: Number(document.getElementById('mPayMonth').value),
                year: Number(document.getElementById('mPayYear').value),
                expectedAmount: expected,
                paidAmount: paid,
                balance: balance,
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMethod: document.getElementById('mPayMethod').value,
                referenceNumber: document.getElementById('mPayRef').value,
                status: status
            };

            payments.unshift(newPay);
            saveData(STORAGE_KEYS.PAYMENTS, payments);
            closeModal();
            showToast('Payment recorded successfully.');
            renderPage(currentPage);
        }

        function generateCurrentMonthPayments() {
            const employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => e.employmentStatus === 'Active' && !e.archived);
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            let addedCount = 0;
            employees.forEach(e => {
                const exists = payments.some(p => p.employeeId === e.id && p.month == curMonth && p.year == curYear);
                if (!exists) {
                    payments.push({
                        id: generateId(),
                        employeeId: e.id,
                        employeeName: e.fullName,
                        companyId: e.companyId,
                        companyName: e.companyName,
                        month: curMonth,
                        year: curYear,
                        expectedAmount: e.monthlyFee || 350,
                        paidAmount: 0,
                        balance: e.monthlyFee || 350,
                        paymentDate: '-',
                        paymentMethod: '-',
                        referenceNumber: '-',
                        status: 'UNPAID'
                    });
                    addedCount++;
                }
            });

            saveData(STORAGE_KEYS.PAYMENTS, payments);
            showToast(`Generated obligations for ${addedCount} employees.`);
            renderPage(currentPage);
        }

        // Receipt Printing
        function printReceipt(paymentId) {
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const p = payments.find(x => x.id === paymentId);
            if (!p) return;

            const printContainer = document.getElementById('printableReceipt');
            printContainer.innerHTML = `
                <div class="p-4 border border-2 rounded">
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <div>
                            <h3 class="fw-bold mb-0">OFFICIAL PAYMENT RECEIPT</h3>
                            <span class="text-muted">Saudi EMS Platform</span>
                        </div>
                        <div class="text-end">
                            <h5 class="fw-bold mb-0">Ref: ${p.referenceNumber || p.id}</h5>
                            <small class="text-muted">Date: ${p.paymentDate}</small>
                        </div>
                    </div>
                    <div class="row mb-4">
                        <div class="col-6">
                            <h6><strong>Employee Details:</strong></h6>
                            <div>Name: ${p.employeeName}</div>
                            <div>Company: ${p.companyName}</div>
                        </div>
                        <div class="col-6 text-end">
                            <h6><strong>Payment Summary:</strong></h6>
                            <div>Period: ${p.month}/${p.year}</div>
                            <div>Method: ${p.paymentMethod}</div>
                        </div>
                    </div>
                    <table class="table table-bordered mb-4">
                        <thead>
                            <tr><th>Description</th><th>Expected</th><th>Paid Amount</th><th>Balance</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Monthly Sponsorship Fee</td>
                                <td>${p.expectedAmount} SAR</td>
                                <td class="fw-bold">${p.paidAmount} SAR</td>
                                <td>${p.balance} SAR</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="text-end">
                        <span class="badge badge-${p.status.toLowerCase()} p-2 fs-6">STATUS: ${p.status}</span>
                    </div>
                </div>
            `;

            printContainer.classList.remove('d-none');
            window.print();
            printContainer.classList.add('d-none');
        }

        // CSV Export Helper
        function exportDataCSV(type) {
            let data = [];
            let filename = `${type}_export.csv`;

            if (type === 'employees') {
                data = getData(STORAGE_KEYS.EMPLOYEES) || [];
            } else if (type === 'payments') {
                data = getData(STORAGE_KEYS.PAYMENTS) || [];
            }

            if (data.length === 0) {
                showToast('No data to export.', 'warning');
                return;
            }

            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(obj => Object.values(obj).map(v => `"${v}"`).join(','));
            const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // Backup and Restore
        function exportBackupJSON() {
            const backup = {
                settings: getData(STORAGE_KEYS.SETTINGS),
                companies: getData(STORAGE_KEYS.COMPANIES),
                employees: getData(STORAGE_KEYS.EMPLOYEES),
                payments: getData(STORAGE_KEYS.PAYMENTS)
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `EMS_Backup_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }

        function restoreBackupJSON() {
            const fileInput = document.getElementById('restoreFileInput');
            if (!fileInput.files.length) {
                alert('Please choose a backup JSON file first.');
                return;
            }

            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (confirm('Overwriting existing system data with this backup. Continue?')) {
                        if (data.settings) saveData(STORAGE_KEYS.SETTINGS, data.settings);
                        if (data.companies) saveData(STORAGE_KEYS.COMPANIES, data.companies);
                        if (data.employees) saveData(STORAGE_KEYS.EMPLOYEES, data.employees);
                        if (data.payments) saveData(STORAGE_KEYS.PAYMENTS, data.payments);
                        showToast('Backup restored successfully.');
                        renderPage(currentPage);
                    }
                } catch (err) {
                    alert('Invalid JSON backup file.');
                }
            };
            reader.readAsText(file);
        }

        function saveSystemSettings(e) {
            e.preventDefault();
            const settings = {
                businessName: document.getElementById('setBusinessName').value,
                defaultFee: Number(document.getElementById('setDefaultFee').value) || 350
            };
            saveData(STORAGE_KEYS.SETTINGS, settings);
            showToast('Settings saved.');
            applyLanguage(currentLang);
        }

        // ==========================================
        // INITIALIZATION & EVENT LISTENERS
        // ==========================================
        document.addEventListener('DOMContentLoaded', async () => {
            // Supabase session + cloud data are loaded before the first page render.
            await ensureOnlineData();

            // Setup Language Toggle Button
            document.getElementById('langSwitchBtn').addEventListener('click', () => {
                const newLang = currentLang === 'en' ? 'ar' : 'en';
                applyLanguage(newLang);
            });

    
        // ===================== DELETE CONTROLS =====================
        // All destructive actions use confirmation and preserve unrelated records.
        function deleteEmployee(id) {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const emp = employees.find(e => e.id === id);
            if (!emp) return;
            if (!confirm(`Delete employee "${emp.fullName}" permanently?\n\nThis removes the employee record. Payment history is preserved.`)) return;
            saveData(STORAGE_KEYS.EMPLOYEES, employees.filter(e => e.id !== id));
            logActivity('Delete Employee', `Employee ${emp.fullName} deleted.`);
            showToast('Employee deleted permanently.', 'warning');
            renderPage(currentPage);
        }

        function deleteCompany(id) {
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            const company = companies.find(c => c.id === id);
            if (!company) return;
            if (!confirm(`Delete company "${company.companyName}" permanently?\n\nEmployees will remain but will become unassigned.`)) return;
            saveData(STORAGE_KEYS.COMPANIES, companies.filter(c => c.id !== id));
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            employees.forEach(e => { if (e.companyId === id) { e.companyId = ''; e.companyName = '-'; } });
            saveData(STORAGE_KEYS.EMPLOYEES, employees);
            logActivity('Delete Company', `Company ${company.companyName} deleted.`);
            showToast('Company deleted permanently.', 'warning');
            renderPage(currentPage);
        }

        function deletePayment(id) {
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            const payment = payments.find(p => p.id === id);
            if (!payment) return;
            if (!confirm(`Delete payment record for "${payment.employeeName}"?\n\nThis cannot be undone.`)) return;
            saveData(STORAGE_KEYS.PAYMENTS, payments.filter(p => p.id !== id));
            logActivity('Delete Payment', `Payment ${payment.referenceNumber || payment.id} deleted.`);
            showToast('Payment deleted permanently.', 'warning');
            renderPage(currentPage);
        }

        function deleteAllEmployees() {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            if (!employees.length) return showToast('No employees to delete.', 'warning');
            if (!confirm(`Delete ALL ${employees.length} employees permanently?\n\nPayment records will remain.`)) return;
            saveData(STORAGE_KEYS.EMPLOYEES, []);
            logActivity('Delete All Employees', `${employees.length} employee records deleted.`);
            showToast('All employees deleted.', 'warning');
            renderPage(currentPage);
        }

        function deleteAllCompanies() {
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            if (!companies.length) return showToast('No companies to delete.', 'warning');
            if (!confirm(`Delete ALL ${companies.length} companies permanently?\n\nEmployees will become unassigned.`)) return;
            saveData(STORAGE_KEYS.COMPANIES, []);
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            employees.forEach(e => { e.companyId = ''; e.companyName = '-'; });
            saveData(STORAGE_KEYS.EMPLOYEES, employees);
            logActivity('Delete All Companies', `${companies.length} company records deleted.`);
            showToast('All companies deleted.', 'warning');
            renderPage(currentPage);
        }

        function deleteAllPayments() {
            const payments = getData(STORAGE_KEYS.PAYMENTS) || [];
            if (!payments.length) return showToast('No payment records to delete.', 'warning');
            if (!confirm(`Delete ALL ${payments.length} payment records permanently?\n\nPayment history will also disappear because it is based on payment records.`)) return;
            saveData(STORAGE_KEYS.PAYMENTS, []);
            logActivity('Delete All Payments', `${payments.length} payment records deleted.`);
            showToast('All payment records deleted.', 'warning');
            renderPage(currentPage);
        }


        window.deleteEmployee = deleteEmployee;
        window.deleteCompany = deleteCompany;
        window.deletePayment = deletePayment;
        window.deleteAllEmployees = deleteAllEmployees;
        window.deleteAllCompanies = deleteAllCompanies;
        window.deleteAllPayments = deleteAllPayments;

        // Navigation Links Listener
            document.querySelectorAll('.nav-link-custom').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = link.getAttribute('data-page');
                    navigateTo(page);

                    // Close mobile menu if open
                    const mobileSidebarEl = document.getElementById('mobileSidebar');
                    const bsOffcanvas = bootstrap.Offcanvas.getInstance(mobileSidebarEl);
                    if (bsOffcanvas) bsOffcanvas.hide();
                });
            });

            // Admin login / logout
            const loginForm = document.getElementById('adminLoginForm');
            if (loginForm) loginForm.addEventListener('submit', loginAdmin);
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);

            updateAdminHeader();
            if (isAdminLoggedIn()) {
                hideLoginScreen();
            } else {
                showLoginScreen();
            }

            // Initial Language and Page Render
            applyLanguage(currentLang);

            // Keep the UI authenticated if the Supabase session changes in another tab.
            supabaseClient.auth.onAuthStateChange(async (_event, session) => {
                onlineUser = session?.user || null;
                if (onlineUser) {
                    await loadCloudData();
                    hideLoginScreen();
                    updateAdminHeader();
                    renderPage(currentPage);
                } else {
                    onlineDataReady = false;
                    showLoginScreen();
                }
            });
        });
