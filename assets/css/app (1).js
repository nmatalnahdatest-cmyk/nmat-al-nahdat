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
            if (dataKeys().includes(key) && !requireWrite()) return false;
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
            if (!onlineUser || !workspaceOwnerId || !['owner','editor'].includes(workspaceRole)) return false;
            const { error } = await supabaseClient
                .from('app_data')
                .upsert({ user_id: workspaceOwnerId, data_key: key, data_value: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,data_key' });
            if (error) {
                console.error('Supabase sync error:', key, error);
                showToast('Online save failed. Check your connection and workspace permission.', 'danger');
            }
            return !error;
        }

        let cloudLoadInFlight = null;
        async function loadCloudData() {
            if (!onlineUser) return false;
            if (cloudLoadInFlight) return cloudLoadInFlight;
            const userId=onlineUser.id;
            cloudLoadInFlight=(async()=>{
                onlineDataReady=false;
                try {
                    const previousOwner=localStorage.getItem('nmat_cache_owner');
                    const previousUser=localStorage.getItem('nmat_cache_user');
                    const legacy={};dataKeys().forEach(key=>legacy[key]=getData(key));
                    await resolveWorkspace();
                    const owner=workspaceOwnerId;
                    const {data,error}=await supabaseClient.from('app_data').select('data_key,data_value').eq('user_id',owner);
                    if(error)throw error;
                    if(!onlineUser||onlineUser.id!==userId)return false;
                    const rows=data||[];
                    if(owner===userId && (!previousOwner||previousOwner===owner) && (!previousUser||previousUser===userId)) {
                        for(const key of dataKeys())if(!rows.some(row=>row.data_key===key) && legacy[key]!=null){if(!await syncDataKey(key,legacy[key]))throw new Error('Initial data migration failed.');rows.push({data_key:key,data_value:legacy[key]});}
                    }
                    clearWorkspaceCache();
                    rows.forEach(row=>{if(dataKeys().includes(row.data_key)){dataCache[row.data_key]=row.data_value;localStorage.setItem(row.data_key,JSON.stringify(row.data_value));}});
                    dataKeys().forEach(key=>{if(!(key in dataCache))dataCache[key]=key===STORAGE_KEYS.SETTINGS?{...defaultSettings}:[];});
                    localStorage.setItem('nmat_cache_owner',owner);localStorage.setItem('nmat_cache_user',userId);
                    onlineDataReady=true;return true;
                }catch(error){showToast('Could not load workspace: '+error.message,'danger');return false;}
            })();
            try{return await cloudLoadInFlight;}finally{cloudLoadInFlight=null;}
        }

        async function ensureOnlineData() {
            const { data: { session } } = await supabaseClient.auth.getSession();
            onlineUser = session?.user || null;
            if (!onlineUser) return false;
            return await loadCloudData();
        }

        // Supabase authentication replaces the old hard-coded admin/admin123 login.
        function isAdminLoggedIn() {
            return !!onlineUser && onlineDataReady;
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
            if (!await loadCloudData()) return;
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
            clearWorkspaceCache();workspaceRole='viewer';workspaceOwnerId=null;
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

        // Demo data is never seeded into a live or shared workspace.

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
                .reduce((acc, e) => acc + workerFee(e), 0);

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
                if (el.getAttribute('data-page') === (page === 'worker-profile' ? 'worker-search' : page)) el.classList.add('active');
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
                case 'worker-search': renderWorkerLookup(container); break;
                case 'worker-profile': renderWorkerProfile(container); break;
                case 'domestic': renderEmployees(container); break;
                case 'domestic-payments': renderDomesticPayments(container); break;
                case 'exit-reentry': renderExitReentry(container); break;
                case 'companies': renderCompanies(container); break;
                case 'payments': renderPayments(container); break;
                case 'payment-history': renderPaymentHistory(container); break;
                case 'id-expiry': renderIdExpiry(container); break;
                case 'reports': renderReports(container); break;
                case 'settings': renderSettings(container); container.innerHTML += accessSettingsHTML(); loadMemberList(); break;
                case 'reminders': renderReminders(container); break;
                default: renderDashboard(container);
            }
            applyRoleUI();refreshReminderBell();
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

                <div class="dashboard-search-banner mb-4"><div><span class="eyebrow">${label('WORKER INTELLIGENCE','بيانات العامل')}</span><h5 class="mb-1">${label('Find a worker. See the full account.','ابحث عن العامل واعرض حسابه الكامل.')}</h5><span class="small">${label('Iqama, phone, visa and payment history, together.','الإقامة والهاتف والتأشيرة وسجل الدفعات في مكان واحد.')}</span></div><button class="btn btn-light" onclick="navigateTo('worker-search')"><i class="bi bi-search me-2"></i>${label('Worker Search','البحث عن عامل')}</button></div>
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
            const employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => workerType(e) === (currentPage === "domestic" ? "domestic" : "company"));
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];

            container.innerHTML = `
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 gap-2">
                    <h4 class="fw-bold mb-0">${currentPage === 'domestic' ? label('Domestic Workers','العمالة المنزلية') : label('Company Workers','عمال الشركات')}</h4>
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
                        <td class="fw-semibold">${workerFee(e)} SAR</td>
                        <td><span class="badge badge-${e.employmentStatus.toLowerCase().replace(' ', '-')}">${e.employmentStatus}</span></td>
                        <td class="text-end">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="openVisaModal('${e.id}')" title="Exit Re-entry"><i class="bi bi-airplane"></i></button><button class="btn btn-outline-primary" onclick="viewEmployeeDetails('${e.id}')" title="View"><i class="bi bi-eye"></i></button>
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

            let employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => workerType(e) === (currentPage === "domestic" ? "domestic" : "company"));

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
            const payments = (getData(STORAGE_KEYS.PAYMENTS) || []).filter(p => paymentType(p) !== 'domestic');
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h4 class="fw-bold mb-0">${currentLang === 'ar' ? 'الدفعات الشهرية' : 'Monthly Payment Register'}</h4>
                        <span class="text-muted small">Period: ${curMonth}/${curYear}</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-danger btn-sm" onclick="deleteCompanyPayments()"><i class="bi bi-trash3 me-1"></i> Delete All</button>
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
                idExpiryDate: '', workerType: currentPage === 'domestic' ? 'domestic' : 'company', companyId: currentPage === 'domestic' ? '' : (companies[0]?.id || ''), monthlyFee: currentPage === 'domestic' ? 300 : 350, employmentStatus: 'Active'
            };

            if (editId) {
                const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
                emp = employees.find(e => e.id === editId) || emp;
            }

            const bodyHTML = `
                <form onsubmit="saveEmployeeForm(event, '${editId || ''}')">
                    <div class="row g-2">
                        <div class="col-md-6"><label class="form-label small fw-bold">Worker Type / نوع العامل</label><select id="mEmpType" class="form-select form-select-sm" onchange="updateWorkerTypeForm()"><option value="company" ${workerType(emp) === 'company' ? 'selected' : ''}>Company Worker</option><option value="domestic" ${workerType(emp) === 'domestic' ? 'selected' : ''}>Domestic Worker</option></select></div>
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
                            <select id="mEmpCompany" class="form-select form-select-sm" ${workerType(emp) === 'domestic' ? 'disabled' : 'required'}><option value="">Select Company</option>
                                ${companies.map(c => `<option value="${c.id}" ${c.id === emp.companyId ? 'selected' : ''}>${c.companyName}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Profession</label>
                            <input type="text" id="mEmpProfession" class="form-control form-control-sm" value="${emp.profession}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold">Monthly Fee (SAR)</label>
                            <input type="number" id="mEmpFee" class="form-control form-control-sm" value="${workerFee(emp)}" min="0" step="0.01" required>
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
            if (!requireWrite()) return;
            e.preventDefault();
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const companies = getData(STORAGE_KEYS.COMPANIES) || [];
            
            const type = document.getElementById('mEmpType').value;
            const iqama = document.getElementById('mEmpIqama').value.trim();
            if (employees.some(x => x.id !== editId && x.iqamaNumber === iqama)) return showToast('Iqama / ID already exists.', 'warning');
            const companyId = type === 'domestic' ? '' : document.getElementById('mEmpCompany').value;
            const company = companies.find(c => c.id === companyId);

            const newEmp = {
                id: editId || generateId(),
                employeeCode: editId ? (employees.find(x => x.id === editId)?.employeeCode || '1000') : Math.floor(1000 + Math.random() * 9000).toString(),
                fullName: document.getElementById('mEmpName').value,
                arabicName: document.getElementById('mEmpNameAr').value,
                iqamaNumber: iqama,
                workerType: type,
                idExpiryDate: document.getElementById('mEmpExpiry').value,
                phone: document.getElementById('mEmpPhone').value,
                companyId: companyId,
                companyName: type === 'domestic' ? 'Domestic Worker' : (company ? company.companyName : '-'),
                profession: document.getElementById('mEmpProfession').value,
                monthlyFee: Number(document.getElementById('mEmpFee').value),
                employmentStatus: document.getElementById('mEmpStatus').value,
                archived: editId ? Boolean(employees.find(x => x.id === editId)?.archived) : false,
                createdAt: editId ? (employees.find(x => x.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
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
            if (!requireWrite()) return;
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
            selectedWorkerId = id;
            navigateTo('worker-profile');
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
            if (!requireWrite()) return;
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
            const requestedWorker = (getData(STORAGE_KEYS.EMPLOYEES) || []).find(e => e.id === empId);
            const employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => !e.archived && workerType(e) === (requestedWorker ? workerType(requestedWorker) : (currentPage === 'domestic-payments' || currentPage === 'domestic' ? 'domestic' : 'company')));
            if (!employees.length) return showToast('Add a worker first.', 'warning');
            const curMonth = new Date().getMonth() + 1;
            const curYear = new Date().getFullYear();

            const selectedEmp = empId ? employees.find(e => e.id === empId) : employees[0];

            const bodyHTML = `
                <form onsubmit="savePaymentForm(event)">
                    <div class="row g-2">
                        <div class="col-md-12">
                            <label class="form-label small fw-bold">Select Employee</label>
                            <select id="mPayEmp" class="form-select form-select-sm" onchange="updatePaymentModalFee()" required>
                                ${employees.map(e => `<option value="${e.id}" data-fee="${workerFee(e)}" ${e.id === empId ? 'selected' : ''}>${e.fullName} (${e.iqamaNumber})</option>`).join('')}
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
                            <input type="number" id="mPayExpected" class="form-control form-control-sm" value="${selectedEmp ? workerFee(selectedEmp) : 350}" readonly>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small fw-bold">Paid Amount (SAR)</label>
                            <input type="number" id="mPayPaid" class="form-control form-control-sm" value="${selectedEmp ? workerFee(selectedEmp) : 350}" required>
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
            if (!requireWrite()) return;
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
                workerType: workerType(emp),
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

            if (!emp || !Number.isFinite(expected) || expected < 0 || !Number.isFinite(paid) || paid < 0) return showToast('Invalid payment.', 'warning');
            const existing = payments.find(p => p.employeeId === empId && Number(p.month) === newPay.month && Number(p.year) === newPay.year);
            if (existing) {
                const totalPaid = currencyRound(Number(existing.paidAmount || 0) + paid);
                const peerPaid = payments.filter(p => p !== existing && p.employeeId === empId && Number(p.month) === newPay.month && Number(p.year) === newPay.year).reduce((n,p)=>n+Number(p.paidAmount||0),0);
                if (currencyRound(totalPaid + peerPaid) > currencyRound(existing.expectedAmount)) return showToast('Amount exceeds outstanding balance.', 'warning');
                if (!existing.paymentEvents) existing.paymentEvents = Number(existing.paidAmount) > 0 ? [{ amount: Number(existing.paidAmount), date: existing.paymentDate, method: existing.paymentMethod, reference: existing.referenceNumber, legacy: true }] : [];
                if (paid > 0) existing.paymentEvents.push({amount:paid,date:newPay.paymentDate,method:newPay.paymentMethod,reference:newPay.referenceNumber});
                Object.assign(existing, { paidAmount: totalPaid, balance: currencyRound(Number(existing.expectedAmount) - totalPaid), status: totalPaid >= existing.expectedAmount ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : 'UNPAID', paymentDate: newPay.paymentDate, paymentMethod: newPay.paymentMethod, referenceNumber: newPay.referenceNumber, workerType: workerType(emp) });
            } else {
                if (paid > expected) return showToast('Amount exceeds expected fee.', 'warning');
                newPay.paymentEvents = paid > 0 ? [{amount:paid,date:newPay.paymentDate,method:newPay.paymentMethod,reference:newPay.referenceNumber}] : [];
                payments.unshift(newPay);
            }
            saveData(STORAGE_KEYS.PAYMENTS, payments);
            closeModal();
            showToast('Payment recorded successfully.');
            renderPage(currentPage);
        }

        function generateCurrentMonthPayments(scope = 'all') {
            if (!requireWrite()) return;
            const employees = (getData(STORAGE_KEYS.EMPLOYEES) || []).filter(e => e.employmentStatus === 'Active' && !e.archived && (scope === 'all' || workerType(e) === scope));
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
                        workerType: workerType(e),
                        employeeName: e.fullName,
                        companyId: e.companyId,
                        companyName: e.companyName,
                        month: curMonth,
                        year: curYear,
                        expectedAmount: workerFee(e),
                        paidAmount: 0,
                        balance: workerFee(e),
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
            if (!requireWrite()) return;
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
            if (!requireWrite()) return;
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
        function workerType(e) { return e?.workerType === 'domestic' ? 'domestic' : 'company'; }
        function workerFee(e) { return Number.isFinite(Number(e?.monthlyFee)) && e?.monthlyFee !== '' && e?.monthlyFee != null ? Number(e.monthlyFee) : workerType(e) === 'domestic' ? 300 : 350; }
        function paymentType(p) { return p.workerType || workerType((getData(STORAGE_KEYS.EMPLOYEES) || []).find(e => e.id === p.employeeId)); }
        function label(en, ar) { return currentLang === 'ar' ? ar : en; }
        function safe(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        Object.assign(i18n.en, { global_search: 'Iqama / Name · press Enter', nav_reminders: 'Reminders', nav_worker_search: 'Worker Search', nav_company_workers: 'Company Workers', nav_domestic: 'Domestic Workers', nav_domestic_payments: 'Domestic Payments', nav_visa: 'Exit Re-entry' });
        Object.assign(i18n.ar, { global_search: 'الإقامة / الاسم · اضغط Enter', nav_reminders: 'التنبيهات', nav_worker_search: 'البحث عن عامل', nav_company_workers: 'عمال الشركات', nav_domestic: 'العمالة المنزلية', nav_domestic_payments: 'دفعات العمالة المنزلية', nav_visa: 'الخروج والعودة' });
        function updateWorkerTypeForm() {
            const domestic = document.getElementById('mEmpType').value === 'domestic';
            const company = document.getElementById('mEmpCompany');
            company.disabled = domestic; company.required = !domestic;
            document.getElementById('mEmpFee').value = domestic ? 300 : 350;
        }
        function deleteCompanyPayments() {
            if (!requireWrite()) return;
            if (!confirm('Delete company payment records? Domestic payments will remain.')) return;
            saveData(STORAGE_KEYS.PAYMENTS, (getData(STORAGE_KEYS.PAYMENTS) || []).filter(p => paymentType(p) === 'domestic'));
            renderPage(currentPage);
        }
        function renderDomesticPayments(container) {
            container.innerHTML = `<div class="d-flex flex-wrap justify-content-between gap-2 mb-3"><div><h4>${label('Domestic Worker Payments','دفعات العمالة المنزلية')}</h4><p class="text-muted">${label('Default monthly fee: 300 SAR per worker. Separate domestic payment register.','الرسوم الشهرية الافتراضية: 300 ريال لكل عامل.')}</p></div><div><button class="btn btn-primary me-2" onclick="generateCurrentMonthPayments('domestic')">${label('Generate Current Month','إنشاء دفعات الشهر')}</button><button class="btn btn-success" onclick="openRecordPaymentModal()">${label('Record Payment','تسجيل دفعة')}</button></div></div><div class="row g-2 mb-3"><div class="col-md-6"><input id="domPaySearch" class="form-control" placeholder="Search Iqama / Name / Phone" oninput="filterDomesticPayments()"></div><div class="col-md-3"><input id="domPayPeriod" type="month" class="form-control" value="${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}" onchange="filterDomesticPayments()"></div><div class="col-md-3"><select id="domPayStatus" class="form-select" onchange="filterDomesticPayments()"><option value="">All statuses</option><option>PAID</option><option>PARTIAL</option><option>UNPAID</option></select></div></div><div id="domPayTotals" class="alert alert-light border"></div><div class="dashboard-card table-responsive"><table class="table"><thead><tr><th>Name / Iqama</th><th>Period</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody id="domPayRows"></tbody></table></div>`;
            filterDomesticPayments();
        }
        function filterDomesticPayments() {
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            const q = document.getElementById('domPaySearch').value.trim().toLowerCase();
            const period = document.getElementById('domPayPeriod').value;
            const status = document.getElementById('domPayStatus').value;
            const rows = (getData(STORAGE_KEYS.PAYMENTS) || []).filter(p => {
                const e = employees.find(x => x.id === p.employeeId);
                return paymentType(p) === 'domestic' && (!period || `${p.year}-${String(p.month).padStart(2,'0')}` === period) && (!status || p.status === status) && [p.employeeName,e?.iqamaNumber,e?.phone].some(v => String(v || '').toLowerCase().includes(q));
            });
            const sum = key => rows.reduce((n,p) => n + Number(p[key] || 0),0);
            document.getElementById('domPayTotals').textContent = `Expected: ${sum('expectedAmount')} SAR | Paid: ${sum('paidAmount')} SAR | Balance: ${sum('balance')} SAR`;
            document.getElementById('domPayRows').innerHTML = rows.map(p => { const e=employees.find(x=>x.id===p.employeeId); return `<tr><td>${safe(p.employeeName)}<div class="small text-muted">${safe(e?.iqamaNumber)}</div></td><td>${p.month}/${p.year}</td><td>${p.expectedAmount}</td><td>${p.paidAmount}</td><td>${p.balance}</td><td>${safe(p.status)}</td><td>${e && !e.archived ? `<button class="btn btn-sm btn-success" onclick="openRecordPaymentModal('${safe(p.employeeId)}');setPaymentPeriod(${Number(p.month)},${Number(p.year)},${Number(p.balance)})">Pay</button>` : ''} <button class="btn btn-sm btn-outline-dark" onclick="printReceipt('${safe(p.id)}')">Receipt</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="text-center p-4">No domestic payments in this period.</td></tr>';
        }
        function setPaymentPeriod(month, year, balance) {
            document.getElementById('mPayMonth').value = month;
            document.getElementById('mPayYear').value = year;
            document.getElementById('mPayPaid').value = balance;
        }
        function openVisaModal(id) {
            const e = (getData(STORAGE_KEYS.EMPLOYEES) || []).find(x=>x.id===id); if(!e)return;
            const v = e.exitReentry || {};
            openModal(label('Exit Re-entry Visa','تأشيرة الخروج والعودة'), `<p>${safe(e.fullName)} · ${safe(e.iqamaNumber)}</p><form onsubmit="saveVisaForm(event,'${safe(id)}')"><label class="form-label">Status</label><select id="visaStatus" class="form-select mb-3">${['None','Issued','Outside KSA','Returned','Cancelled'].map(x=>`<option ${x===(v.status||'None')?'selected':''}>${x}</option>`).join('')}</select><label class="form-label">Visa Number</label><input id="visaNumber" class="form-control mb-3" value="${safe(v.number)}"><label class="form-label">Issue Date</label><input id="visaIssue" type="date" class="form-control mb-3" value="${safe(v.issueDate)}"><label class="form-label">Return By</label><input id="visaReturn" type="date" class="form-control mb-3" value="${safe(v.returnBy)}"><button class="btn btn-primary">Save Visa</button></form>`);
        }
        function saveVisaForm(event,id) {
            if (!requireWrite()) return;
            event.preventDefault(); const employees=getData(STORAGE_KEYS.EMPLOYEES)||[]; const e=employees.find(x=>x.id===id); if(!e)return;
            const issueDate=document.getElementById('visaIssue').value, returnBy=document.getElementById('visaReturn').value;
            if(issueDate && returnBy && returnBy<issueDate)return showToast('Return date must follow issue date.','warning');
            e.exitReentry={status:document.getElementById('visaStatus').value,number:document.getElementById('visaNumber').value.trim(),issueDate,returnBy};
            saveData(STORAGE_KEYS.EMPLOYEES,employees);logActivity('Update Visa',e.fullName);closeModal();renderPage(currentPage);showToast('Visa saved.');
        }
        function renderExitReentry(container) {
            container.innerHTML=`<h4 class="mb-3">${label('Exit Re-entry Visas','تأشيرات الخروج والعودة')}</h4><p class="text-muted">Use the airplane button in either worker directory to add a visa.</p><div class="row g-2 mb-3"><div class="col-md-8"><input class="form-control" id="visaSearch" placeholder="Search Iqama / Name / Phone / Visa Number" oninput="filterVisas()"></div><div class="col-md-4"><select class="form-select" id="visaFilter" onchange="filterVisas()"><option value="">All visas</option><option>Issued</option><option>Outside KSA</option><option>Returned</option><option>Cancelled</option></select></div></div><div class="dashboard-card table-responsive"><table class="table"><thead><tr><th>Worker / Iqama</th><th>Type</th><th>Phone</th><th>Visa Number</th><th>Issued</th><th>Return By</th><th>Status</th><th>Action</th></tr></thead><tbody id="visaRows"></tbody></table></div>`;filterVisas();
        }
        function filterVisas() {
            const q=document.getElementById('visaSearch').value.trim().toLowerCase(),status=document.getElementById('visaFilter').value;
            const rows=(getData(STORAGE_KEYS.EMPLOYEES)||[]).filter(e=>e.exitReentry && e.exitReentry.status!=='None' && (!status||e.exitReentry.status===status) && [e.fullName,e.iqamaNumber,e.phone,e.exitReentry.number].some(x=>String(x||'').toLowerCase().includes(q)));
            document.getElementById('visaRows').innerHTML=rows.map(e=>{const v=e.exitReentry;const overdue=v.returnBy && v.returnBy<new Date().toLocaleDateString('en-CA') && ['Issued','Outside KSA'].includes(v.status);return `<tr><td>${safe(e.fullName)}<div>${safe(e.iqamaNumber)}</div></td><td>${workerType(e)==='domestic'?'Domestic':'Company'}</td><td>${safe(e.phone)}</td><td>${safe(v.number)}</td><td>${safe(v.issueDate)}</td><td class="${overdue?'text-danger fw-bold':''}">${safe(v.returnBy)} ${overdue?'(Overdue)':''}</td><td>${safe(v.status)}</td><td><button class="btn btn-sm btn-outline-primary" onclick="openVisaModal('${safe(e.id)}')">Edit</button></td></tr>`;}).join('')||'<tr><td colspan="8" class="text-center p-4">No matching visas.</td></tr>';
        }

        let selectedWorkerId = null;
        let workerLookupQuery = '';
        const normalizeWorkerSearch = value => String(value ?? '').trim().toLowerCase().replace(/[٠-٩۰-۹]/g, c => String('٠١٢٣٤٥٦٧٨٩'.includes(c) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(c) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\s+/g, ' ');
        const currencyRound = value => Math.round((Number(value)||0)*100)/100;
        const money = value => Number(value || 0).toLocaleString(currentLang === 'ar' ? 'ar-SA' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        function workerAccount(id) {
            const records = (getData(STORAGE_KEYS.PAYMENTS) || []).filter(p => p.employeeId === id);
            const groups = new Map();
            records.forEach(p => {
                const key = `${p.year}-${String(p.month).padStart(2,'0')}`;
                if (!groups.has(key)) groups.set(key, {key,month:p.month,year:p.year,expected:0,paid:0,records:[]});
                const g = groups.get(key);
                // Legacy versions stored an unpaid obligation and later payments as separate rows.
                // A worker has one monthly fee, so do not charge that fee once per payment row.
                g.expected = Math.max(g.expected, Number(p.expectedAmount)||0);
                g.paid += Number(p.paidAmount)||0;
                g.records.push(p);
            });
            const months = [...groups.values()].sort((a,b)=>b.key.localeCompare(a.key)).map(g=>({...g,balance:Math.max(0,currencyRound(g.expected-g.paid)),credit:Math.max(0,currencyRound(g.paid-g.expected))}));
            const employee=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id);
            const opening=employee?.openingBalance||{};
            const openingExpected=Number(opening.amount)||0,openingPaid=Number(opening.paid)||0;
            return {records, months, opening, expected:openingExpected+months.reduce((n,g)=>n+g.expected,0), paid:openingPaid+months.reduce((n,g)=>n+g.paid,0), balance:Math.max(0,currencyRound(openingExpected-openingPaid))+months.reduce((n,g)=>n+g.balance,0), credit:Math.max(0,openingPaid-openingExpected)+months.reduce((n,g)=>n+g.credit,0)};
        }
        function renderWorkerLookup(container) {
            container.innerHTML = `<section class="lookup-hero"><span class="eyebrow">${label('PEOPLE & ACCOUNTS','الأشخاص والحسابات')}</span><h2>${label('One worker. The complete picture.','ملف العامل وحسابه بالكامل')}</h2><p>${label('Find personal details, visa information and every recorded monthly balance in one place.','ابحث عن بيانات العامل والتأشيرة وجميع الأرصدة الشهرية المسجلة.')}</p><form class="lookup-form" onsubmit="event.preventDefault();findWorkers(true)"><label for="workerLookup" class="visually-hidden">Iqama, name or phone</label><i class="bi bi-search"></i><input id="workerLookup" inputmode="search" autocomplete="off" placeholder="${label('Enter Iqama / ID, name or phone','رقم الإقامة أو الاسم أو الهاتف')}" value="${safe(workerLookupQuery)}" oninput="findWorkers(false)"><button class="btn btn-primary" type="submit">${label('Find worker','بحث')}</button></form></section><div id="workerResults" class="mt-4" aria-live="polite"></div>`;
            findWorkers(false);
        }
        function findWorkers(openExact = false) {
            const field = document.getElementById('workerLookup'); if(!field)return;
            workerLookupQuery=field.value;
            const q=normalizeWorkerSearch(field.value);
            const all=getData(STORAGE_KEYS.EMPLOYEES)||[];
            const exact=all.filter(e=>normalizeWorkerSearch(e.iqamaNumber)===q);
            if(openExact && q && exact.length===1){viewEmployeeDetails(exact[0].id);return;}
            const rows=q ? all.filter(e=>[e.iqamaNumber,e.fullName,e.arabicName,e.phone,e.employeeCode].some(v=>normalizeWorkerSearch(v).includes(q))) : [];
            const box=document.getElementById('workerResults');
            if(!q){box.innerHTML=`<div class="lookup-empty"><i class="bi bi-person-vcard"></i><h5>${label('Search by Iqama to get started','ابدأ البحث برقم الإقامة')}</h5><p>${label('Company and domestic workers are searched together, including archived profiles.','يشمل البحث عمال الشركات والعمالة المنزلية والملفات المؤرشفة.')}</p></div>`;return;}
            box.innerHTML=`<p class="text-muted small">${rows.length} ${label('matching workers','نتيجة')}</p><div class="row g-3">${rows.map(e=>{const a=workerAccount(e.id);return `<div class="col-md-6 col-xl-4"><button type="button" class="worker-result dashboard-card w-100 text-start" onclick="viewEmployeeDetails('${safe(e.id)}')"><span class="worker-avatar">${safe((e.fullName||'?').slice(0,1).toUpperCase())}</span><span class="d-block fw-bold mt-3">${safe(e.fullName)}</span><span class="small text-muted d-block">${safe(e.iqamaNumber)} · ${safe(e.phone)}</span><span class="d-flex justify-content-between mt-3"><span class="badge bg-light text-dark">${workerType(e)==='domestic'?label('Domestic','عمالة منزلية'):label('Company','شركة')} ${e.archived?' · Archived':''}</span><span class="${a.balance?'text-danger':'text-success'} fw-bold">${money(a.balance)} SAR</span></span></button></div>`;}).join('')}</div>${!rows.length?`<div class="lookup-empty">${label('No worker found. Check the Iqama number or try the name.','لا توجد نتائج. تحقق من رقم الإقامة أو ابحث بالاسم.')}</div>`:''}`;
        }
        function renderWorkerProfile(container) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(x=>x.id===selectedWorkerId);
            if(!e){renderWorkerLookup(container);return;}
            const a=workerAccount(e.id), v=e.exitReentry||{}, expiry=calculateIdStatus(e.idExpiryDate);
            const field=(title,value)=>`<div class="profile-field"><span>${title}</span><strong>${safe(value||'—')}</strong></div>`;
            container.innerHTML=`<button class="btn btn-link px-0 mb-3" onclick="navigateTo('worker-search')"><i class="bi bi-arrow-left me-2"></i>${label('Back to worker search','العودة للبحث')}</button><section class="profile-hero"><div class="d-flex gap-3 align-items-center"><div class="worker-avatar large">${safe((e.fullName||'?').slice(0,1).toUpperCase())}</div><div><span class="eyebrow">${workerType(e)==='domestic'?label('DOMESTIC WORKER','عامل منزلي'):label('COMPANY WORKER','عامل شركة')}</span><h2 class="mb-1">${safe(e.fullName)}</h2><p class="mb-0">${safe(e.arabicName)} · ${label('Iqama','الإقامة')} ${safe(e.iqamaNumber)}</p></div></div><div class="d-flex flex-wrap gap-2 mt-3"><span class="profile-pill">${safe(e.employmentStatus)}${e.archived?' · Archived':''}</span><span class="profile-pill">${safe(e.profession||'Worker')}</span><span class="profile-pill">${money(workerFee(e))} SAR / ${label('month','شهر')}</span></div><div class="d-flex flex-wrap gap-2 mt-4">${!e.archived?`<button class="btn btn-light" onclick="openRecordPaymentModal('${safe(e.id)}')"><i class="bi bi-plus-circle me-1"></i>${label('Record payment','تسجيل دفعة')}</button>`:''}<button class="btn btn-outline-light" onclick="openEditEmployeeModal('${safe(e.id)}')">${label('Edit profile','تعديل الملف')}</button><button class="btn btn-outline-light" onclick="openVisaModal('${safe(e.id)}')">${label('Update visa','تعديل التأشيرة')}</button><button class="btn btn-outline-light" onclick="printWorkerStatement('${safe(e.id)}')"><i class="bi bi-printer me-1"></i>${label('Print statement','طباعة كشف الحساب')}</button></div></section><div class="row g-3 my-2">${[[label('Total recorded dues','إجمالي المستحقات المسجلة'),a.expected,'primary'],[label('Total paid','إجمالي المدفوع'),a.paid,'success'],[label('Outstanding balance','الرصيد المتبقي'),a.balance,'danger'],[label('Recorded months','الأشهر المسجلة'),a.months.length,'secondary']].map(([t,n,c],i)=>`<div class="col-6 col-xl-3"><div class="account-metric"><span>${t}</span><strong class="text-${c}">${i===3?n:money(n)}<small>${i===3?'':' SAR'}</small></strong></div></div>`).join('')}</div>${a.credit?`<div class="alert alert-info">${label('Extra paid amount across recorded months','المبالغ الزائدة في الأشهر المسجلة')}: ${money(a.credit)} SAR. ${label('Shown separately; not automatically applied to another month.','تظهر بشكل منفصل ولا تخصم تلقائياً من شهر آخر.')}</div>`:''}<div class="row g-4 mt-1"><div class="col-xl-5"><div class="dashboard-card p-4 h-100"><h5 class="section-heading"><i class="bi bi-person-vcard"></i>${label('Worker details','بيانات العامل')}</h5><div class="profile-fields">${field(label('Iqama / ID','رقم الإقامة'),e.iqamaNumber)}${field(label('Phone','الهاتف'),e.phone)}${field(label('Profession','المهنة'),e.profession)}${field(label('Company','الشركة'),workerType(e)==='domestic'?label('Domestic worker','عامل منزلي'):e.companyName)}${field(label('Nationality','الجنسية'),e.nationality)}${field(label('Joining date','تاريخ الالتحاق'),e.joiningDate)}${field(label('Employee code','رمز العامل'),e.employeeCode)}${field(label('Iqama expiry','انتهاء الإقامة'),e.idExpiryDate)}${field(label('Expiry status','حالة الإقامة'),expiry.status)}${field(label('Company license','رخصة الشركة'),e.companyLicenseNumber)}${field(label('Unified number','الرقم الموحد'),e.unifiedNumber)}${field(label('Establishment number','رقم المنشأة'),e.establishmentNumber)}</div></div></div><div class="col-xl-7"><div class="dashboard-card p-4 mb-4"><h5 class="section-heading"><i class="bi bi-airplane"></i>${label('Exit re-entry visa','تأشيرة الخروج والعودة')}</h5><div class="profile-fields">${field(label('Status','الحالة'),v.status||'None')}${field(label('Visa number','رقم التأشيرة'),v.number)}${field(label('Issued','تاريخ الإصدار'),v.issueDate)}${field(label('Return by','العودة قبل'),v.returnBy)}</div></div><div class="dashboard-card p-4"><h5 class="section-heading"><i class="bi bi-info-circle"></i>${label('How this balance is calculated','كيفية حساب الرصيد')}</h5><p class="text-muted small mb-0">${label('Saved monthly records and the opening balance are included. Missing months are not estimated. Legacy rows for the same month share one expected monthly fee; recorded payments are added together. The monthly table below shows the calculation.','يشمل الحساب الأشهر المسجلة والرصيد الافتتاحي ولا يقدّر الأشهر المفقودة. السجلات القديمة للشهر نفسه تحتسب رسماً شهرياً واحداً وتجمع المدفوعات. يوضح الجدول أدناه الحساب.')}</p></div></div></div><section class="dashboard-card mt-4 overflow-hidden"><div class="p-4 border-bottom"><h5 class="section-heading mb-0"><i class="bi bi-calendar3"></i>${label('Monthly account history','سجل الحساب الشهري')}</h5></div><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>${label('Month','الشهر')}</th><th>${label('Expected','المستحق')}</th><th>${label('Paid','المدفوع')}</th><th>${label('Balance','المتبقي')}</th><th>${label('Status','الحالة')}</th></tr></thead><tbody>${monthlyAccountRows(a)}</tbody></table></div></section><section class="dashboard-card mt-4 overflow-hidden"><div class="p-4 border-bottom"><h5 class="section-heading mb-0"><i class="bi bi-clock-history"></i>${label('Payment records & receipts','سجلات الدفع والإيصالات')}</h5></div><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Period</th><th>Date</th><th>Paid (SAR)</th><th>Method / Reference</th><th>Receipt</th></tr></thead><tbody>${a.records.map(p=>`<tr><td>${safe(p.month)}/${safe(p.year)}</td><td>${safe(p.paymentDate)}</td><td class="fw-bold text-success">${money(p.paidAmount)}</td><td>${safe(p.paymentMethod)}<div class="small text-muted">${safe(p.referenceNumber)}</div>${p.paymentEvents?.length?`<details class="small mt-2"><summary>${p.paymentEvents.length} payment entries</summary>${p.paymentEvents.map(x=>`<div>${safe(x.date)} · ${money(x.amount)} SAR · ${safe(x.method)} · ${safe(x.reference)}</div>`).join('')}</details>`:''}</td><td><button class="btn btn-sm btn-outline-primary" onclick="printReceipt('${safe(p.id)}')"><i class="bi bi-printer"></i></button></td></tr>`).join('')||'<tr><td colspan="5" class="p-4 text-center text-muted">No payment records yet.</td></tr>'}</tbody></table></div></section>`;
            container.innerHTML += profileToolsHTML(e,a);
        }
        function monthlyAccountRows(a) { return (Number(a.opening?.amount)>0 ? `<tr><td class="fw-semibold">Opening · ${safe(a.opening.date)}</td><td>${money(a.opening.amount)}</td><td>${money(a.opening.paid)}</td><td>${money(Math.max(0,Number(a.opening.amount)-Number(a.opening.paid||0)))}</td><td>Previous dues</td></tr>` : '') + (a.months.map(g=>`<tr><td class="fw-semibold">${safe(g.month)}/${safe(g.year)}</td><td>${money(g.expected)}</td><td class="text-success">${money(g.paid)}</td><td class="text-danger fw-bold">${money(g.balance)}</td><td><span class="badge badge-${g.balance===0?'paid':g.paid>0?'partial':'unpaid'}">${g.balance===0?'PAID':g.paid>0?'PARTIAL':'UNPAID'}</span>${g.credit?`<div class="small">Extra: ${money(g.credit)} SAR</div>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="text-center p-4 text-muted">No recorded monthly dues.</td></tr>'); }
        function printWorkerStatement(id) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(x=>x.id===id);if(!e)return;
            const a=workerAccount(id), settings=getData(STORAGE_KEYS.SETTINGS)||defaultSettings;
            const target=document.getElementById('printableReceipt');
            target.innerHTML=`<div class="p-4"><h2>${safe(settings.businessName)}</h2><h4>${label('Worker account statement','كشف حساب العامل')}</h4><p>${safe(e.fullName)} · ${safe(e.iqamaNumber)} · ${safe(e.phone)}</p><p>Expected: ${money(a.expected)} SAR | Paid: ${money(a.paid)} SAR | Balance: ${money(a.balance)} SAR${a.credit?` | Extra paid: ${money(a.credit)} SAR`:''}</p><table class="table table-bordered"><thead><tr><th>Month</th><th>Expected (SAR)</th><th>Paid (SAR)</th><th>Balance (SAR)</th><th>Status</th></tr></thead><tbody>${monthlyAccountRows(a)}</tbody></table><p class="small">Recorded months and opening balance are included. Generated ${new Date().toLocaleDateString()}.</p></div>`;
            target.classList.remove('d-none');window.print();target.classList.add('d-none');
        }

        let workspaceOwnerId = null;
        let workspaceRole = 'viewer';
        let workspaceChoices = [];
        let workspaceUpgradeReady = false;
        let workspaceSwitchBusy = false;
        const dataKeys = () => [STORAGE_KEYS.SETTINGS,STORAGE_KEYS.COMPANIES,STORAGE_KEYS.EMPLOYEES,STORAGE_KEYS.PAYMENTS,STORAGE_KEYS.LOGS];
        function canEditWorkspace() { return !!onlineUser && onlineDataReady && ['owner','editor'].includes(workspaceRole); }
        function requireWrite() { if(canEditWorkspace())return true;showToast('Read-only workspace. An owner or editor is required.','warning');return false; }
        function clearWorkspaceCache() { dataKeys().forEach(key=>{delete dataCache[key];localStorage.removeItem(key);}); }
        async function resolveWorkspace() {
            const {data,error}=await supabaseClient.from('workspace_members').select('workspace_owner_id,role').eq('member_id',onlineUser.id);
            if(error && !['42P01','PGRST205'].includes(error.code)) throw new Error(error.message);
            workspaceUpgradeReady=!error;
            workspaceChoices=[{id:onlineUser.id,role:'owner',title:'My workspace'},...(data||[]).map(m=>({id:m.workspace_owner_id,role:m.role,title:`Shared workspace · ${m.role} · ${m.workspace_owner_id.slice(0,8)}`}))];
            const saved=localStorage.getItem('nmat_workspace_'+onlineUser.id);
            const choice=workspaceChoices.find(x=>x.id===saved) || workspaceChoices.find(x=>x.role!=='owner') || workspaceChoices[0];
            workspaceOwnerId=choice.id;workspaceRole=choice.role;
            localStorage.setItem('nmat_workspace_'+onlineUser.id,choice.id);
        }
        async function changeWorkspace(owner) {
            if(workspaceSwitchBusy)return;
            workspaceSwitchBusy=true;onlineDataReady=false;
            localStorage.setItem('nmat_workspace_'+onlineUser.id,owner);
            clearWorkspaceCache();selectedWorkerId=null;workerLookupQuery='';
            try {if(await loadCloudData()){navigateTo('worker-search');updateAdminHeader();}else showLoginScreen();}
            finally {workspaceSwitchBusy=false;}
        }
        function applyRoleUI() {
            const mutators=/^(openAddEmployeeModal|openEditEmployeeModal|archiveEmployee|deleteEmployee|deleteAllEmployees|openAddCompanyModal|openEditCompanyModal|deleteCompany|deleteAllCompanies|openRecordPaymentModal|generateCurrentMonthPayments|deletePayment|deleteAllPayments|deleteCompanyPayments|restoreBackupJSON|openVisaModal|openOpeningBalance|openOpeningPayment|uploadWorkerDocument|archiveWorkerDocument|restoreWorkerDocument)/;
            document.querySelectorAll('#mainContent button[onclick]').forEach(b=>{if(mutators.test(b.getAttribute('onclick')||'')){b.disabled=!canEditWorkspace();if(b.disabled)b.title='Read-only access';}});
            if(!canEditWorkspace())document.querySelectorAll('#settingsForm input,#settingsForm button,#restoreFileInput').forEach(e=>e.disabled=true);
            let badge=document.getElementById('workspaceRoleBadge');
            if(!badge){badge=document.createElement('span');badge.id='workspaceRoleBadge';badge.className='badge bg-light text-dark border d-none d-md-inline';document.getElementById('adminUserName')?.after(badge);}
            if(badge)badge.textContent=workspaceRole.toUpperCase();
        }
        function accessSettingsHTML() {
            return `<section class="dashboard-card p-4 mt-4"><h5 class="section-heading"><i class="bi bi-shield-check"></i>Workspace & Access</h5>${!workspaceUpgradeReady?'<div class="alert alert-warning">Run supabase/upgrade_workspace.sql to enable shared users and private document storage.</div>':''}<label class="form-label" for="workspaceSelect">Current workspace</label><select id="workspaceSelect" class="form-select mb-3" onchange="changeWorkspace(this.value)">${workspaceChoices.map(w=>`<option value="${safe(w.id)}" ${w.id===workspaceOwnerId?'selected':''}>${safe(w.title)}</option>`).join('')}</select><p class="small text-muted">Owner: manage access and all data. Editor: change worker records and payments. Viewer: read, view documents and export only.</p>${workspaceRole==='owner' && workspaceUpgradeReady?`<form onsubmit="saveMember(event)" class="row g-2"><div class="col-md-6"><label class="form-label small" for="memberEmail">Existing Supabase user's email</label><input id="memberEmail" type="email" class="form-control" required></div><div class="col-md-3"><label class="form-label small" for="memberRole">Permission</label><select id="memberRole" class="form-select"><option value="viewer">Viewer</option><option value="editor">Editor</option></select></div><div class="col-md-3 d-flex align-items-end"><button class="btn btn-primary w-100">Save access</button></div></form><div id="membersList" class="mt-3 small"></div>`:'<p class="small mb-0">Only the workspace owner can grant or revoke access.</p>'}</section>`;
        }
        async function loadMemberList() {
            if(workspaceRole!=='owner'||!workspaceUpgradeReady)return;
            const {data,error}=await supabaseClient.from('workspace_members').select('member_id,member_email,role').eq('workspace_owner_id',workspaceOwnerId);
            const box=document.getElementById('membersList');if(!box)return;
            if(error){box.textContent=error.message;return;}
            box.innerHTML=(data||[]).map(m=>`<div class="d-flex align-items-center justify-content-between gap-2 border-top py-3"><span>${safe(m.member_email)} <span class="badge bg-light text-dark">${safe(m.role)}</span></span><button class="btn btn-sm btn-outline-danger" onclick="revokeMember('${safe(m.member_id)}')">Revoke</button></div>`).join('')||'No shared users yet.';
        }
        async function saveMember(event) {
            event.preventDefault();if(workspaceRole!=='owner'||!requireWrite()||!workspaceUpgradeReady)return;
            const email=document.getElementById('memberEmail').value.trim(),role=document.getElementById('memberRole').value;
            if(!confirm(`Grant ${role} access to ${email}? They can read this workspace's worker details, payments and documents.${role==='editor'?' They can also change records.':''}`))return;
            const {error}=await supabaseClient.rpc('set_workspace_member',{member_email_input:email,member_role:role});
            if(error)return showToast(error.message,'danger');showToast('Access updated.');loadMemberList();
        }
        async function revokeMember(id) {
            if(workspaceRole!=='owner'||!requireWrite()||!confirm('Revoke this user’s workspace access?'))return;
            const {error}=await supabaseClient.rpc('remove_workspace_member',{member_uuid:id});
            if(error)return showToast(error.message,'danger');showToast('Access revoked.');loadMemberList();
        }
        async function persistEmployeesSafely(employees) {
            if(!requireWrite())return false;
            if(!await syncDataKey(STORAGE_KEYS.EMPLOYEES,employees))return false;
            dataCache[STORAGE_KEYS.EMPLOYEES]=employees;
            localStorage.setItem(STORAGE_KEYS.EMPLOYEES,JSON.stringify(employees));
            return true;
        }
        function profileToolsHTML(e,a) {
            const o=e.openingBalance||{},openingPaid=Number(o.paid)||0;
            return `<section class="dashboard-card p-4 mt-4"><div class="d-flex flex-wrap justify-content-between gap-2"><h5 class="section-heading"><i class="bi bi-wallet2"></i>Opening Balance / আগের বকেয়া</h5><div>${canEditWorkspace()?`<button class="btn btn-sm btn-outline-primary" onclick="openOpeningBalance('${safe(e.id)}')">Set opening balance</button> <button class="btn btn-sm btn-success" onclick="openOpeningPayment('${safe(e.id)}')" ${Number(o.amount||0)<=openingPaid?'disabled':''}>Pay old balance</button>`:''}</div></div><p class="small text-muted">Use for debt from before your recorded monthly accounts. Do not enter the same monthly debt twice.</p><div class="profile-fields"><div class="profile-field"><span>Opening dues · ${safe(o.date||'Not set')}</span><strong>${money(o.amount)} SAR</strong></div><div class="profile-field"><span>Paid / Remaining</span><strong>${money(openingPaid)} / ${money(Math.max(0,Number(o.amount||0)-openingPaid))} SAR</strong></div></div><p class="small text-muted mt-3 mb-0">${safe(o.note)}</p>${o.payments?.length?`<details class="small mt-3"><summary>Old-balance payment entries (${o.payments.length})</summary>${o.payments.map(p=>`<div class="py-1">${safe(p.date)} · ${money(p.amount)} SAR · ${safe(p.method)} · ${safe(p.reference)}</div>`).join('')}</details>`:''}</section><section class="dashboard-card p-4 mt-4"><h5 class="section-heading"><i class="bi bi-folder2-open"></i>Private Documents</h5><p class="small text-muted">PDF, JPG, PNG or WebP · 10 MB maximum each. Only people with workspace access can open these files. JSON backups include file references, not document bytes.</p>${!workspaceUpgradeReady?'<div class="alert alert-warning">Private storage setup required: run upgrade_workspace.sql.</div>':''}${canEditWorkspace()&&workspaceUpgradeReady?`<div class="row g-2 mb-3"><div class="col-md-3"><label class="form-label small" for="docType">Document type</label><select id="docType" class="form-select"><option>Iqama</option><option>Passport</option><option>Visa</option><option>Other</option></select></div><div class="col-md-6"><label class="form-label small" for="workerDocFile">Choose document</label><input id="workerDocFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" class="form-control"></div><div class="col-md-3 d-flex align-items-end"><button id="uploadDocButton" class="btn btn-primary w-100" onclick="uploadWorkerDocument('${safe(e.id)}')">Upload</button></div></div>`:''}<div>${(e.documents||[]).map(d=>`<div class="document-item"><div><strong>${safe(d.type)} ${d.archived?'· Archived':''}</strong><div class="small text-muted">${safe(d.name)} · ${safe(d.uploadedAt?.slice(0,10))}</div></div><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-primary" onclick="openWorkerDocument('${safe(e.id)}','${safe(d.id)}')">Open</button>${canEditWorkspace()?`<button class="btn btn-sm btn-outline-secondary" onclick="${d.archived?'restoreWorkerDocument':'archiveWorkerDocument'}('${safe(e.id)}','${safe(d.id)}')">${d.archived?'Restore':'Archive'}</button>`:''}</div></div>`).join('')||'<p class="small text-muted mb-0">No documents uploaded.</p>'}</div></section><section class="dashboard-card p-4 mt-4"><h5 class="section-heading"><i class="bi bi-whatsapp"></i>WhatsApp Draft</h5><p class="small text-muted">Prepare a balance or expiry reminder. Review the message before opening WhatsApp. Nothing is sent automatically.</p><button class="btn btn-success" onclick="openWhatsAppDraft('${safe(e.id)}')">Prepare message</button></section>`;
        }
        function openOpeningBalance(id) {
            if(!requireWrite())return;const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id);if(!e)return;const o=e.openingBalance||{};
            openModal('Opening Balance · আগের বকেয়া',`<p>${safe(e.fullName)} · ${safe(e.iqamaNumber)}</p><div class="alert alert-info small">Enter only debt not already included in monthly records. Previously paid opening amounts are preserved.</div><form onsubmit="saveOpeningBalance(event,'${safe(id)}')"><label for="openingAmount" class="form-label">Previous dues (SAR)</label><input id="openingAmount" type="number" class="form-control mb-3" min="${Number(o.paid||0)}" step="0.01" required value="${Number(o.amount||0)}"><label for="openingDate" class="form-label">Balance as of</label><input id="openingDate" type="date" class="form-control mb-3" required value="${safe(o.date||new Date().toLocaleDateString('en-CA'))}"><label class="form-label" for="openingNote">Note / covered period</label><input id="openingNote" class="form-control mb-3" maxlength="500" value="${safe(o.note)}"><button class="btn btn-primary">Save balance</button></form>`);
        }
        async function saveOpeningBalance(event,id) {
            event.preventDefault();if(!requireWrite())return;const employees=structuredClone(getData(STORAGE_KEYS.EMPLOYEES)||[]),e=employees.find(e=>e.id===id);if(!e)return;
            const amount=Number(document.getElementById('openingAmount').value),date=document.getElementById('openingDate').value;
            if(!Number.isFinite(amount)||amount<Number(e.openingBalance?.paid||0)||amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(date))return showToast('Invalid opening balance.','warning');
            e.openingBalance={...e.openingBalance,amount,date,note:document.getElementById('openingNote').value.trim(),updatedAt:new Date().toISOString()};
            if(await persistEmployeesSafely(employees)){closeModal();renderPage(currentPage);showToast('Opening balance saved.');}
        }
        function openOpeningPayment(id) {
            if(!requireWrite())return;const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id);if(!e)return;const remaining=Math.max(0,currencyRound(Number(e.openingBalance?.amount||0)-Number(e.openingBalance?.paid||0)));if(!remaining)return showToast('No old balance due.','warning');
            openModal('Pay Old Balance',`<p>${safe(e.fullName)} · Remaining ${money(remaining)} SAR</p><form onsubmit="saveOpeningPayment(event,'${safe(id)}')"><label class="form-label" for="oldPayAmount">Amount received (SAR)</label><input id="oldPayAmount" class="form-control mb-3" type="number" min="0.01" max="${remaining}" step="0.01" value="${remaining}" required><label class="form-label" for="oldPayMethod">Method</label><select id="oldPayMethod" class="form-select mb-3"><option>Cash</option><option>Bank Transfer</option><option>Card</option></select><label class="form-label" for="oldPayReference">Reference</label><input id="oldPayReference" class="form-control mb-3" maxlength="100"><button class="btn btn-success">Record payment</button></form>`);
        }
        async function saveOpeningPayment(event,id) {
            event.preventDefault();if(!requireWrite())return;const employees=structuredClone(getData(STORAGE_KEYS.EMPLOYEES)||[]),e=employees.find(e=>e.id===id);if(!e)return;
            const o=e.openingBalance||{},amount=Number(document.getElementById('oldPayAmount').value),remaining=currencyRound(Number(o.amount||0)-Number(o.paid||0));
            if(!Number.isFinite(amount)||amount<=0||amount>remaining)return showToast('Amount exceeds old balance.','warning');
            o.paid=Math.round((Number(o.paid||0)+amount)*100)/100;o.payments=o.payments||[];o.payments.push({id:generateId(),amount,date:new Date().toISOString().slice(0,10),method:document.getElementById('oldPayMethod').value,reference:document.getElementById('oldPayReference').value.trim()});e.openingBalance=o;
            if(await persistEmployeesSafely(employees)){closeModal();renderPage(currentPage);showToast('Old-balance payment saved.');}
        }
        async function uploadWorkerDocument(id) {
            if(!requireWrite()||!workspaceUpgradeReady)return;
            const file=document.getElementById('workerDocFile').files[0],type=document.getElementById('docType').value;
            const allowed={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
            if(!file||!allowed[file.type]||file.size>10485760||file.size===0)return showToast('Select a PDF, JPG, PNG or WebP up to 10 MB.','warning');
            const button=document.getElementById('uploadDocButton');button.disabled=true;button.textContent='Uploading…';
            const owner=workspaceOwnerId,docId=crypto.randomUUID(),path=`${owner}/${id}/${docId}.${allowed[file.type]}`;
            try {
                const {error}=await supabaseClient.storage.from('worker-documents').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
                if(owner!==workspaceOwnerId)throw new Error('Workspace changed. Please retry in the original workspace.');
                const employees=structuredClone(getData(STORAGE_KEYS.EMPLOYEES)||[]),e=employees.find(e=>e.id===id);if(!e)throw new Error('Worker no longer exists.');
                e.documents=e.documents||[];e.documents.push({id:docId,path,name:file.name,type,size:file.size,mime:file.type,uploadedAt:new Date().toISOString(),archived:false});
                if(!await persistEmployeesSafely(employees)){showToast('File uploaded but its record could not be saved. Retry when online.','danger');return;}
                renderPage(currentPage);showToast('Document saved privately.');
            }catch(error){showToast(error.message||'Upload failed.','danger');}finally{button.disabled=false;button.textContent='Upload';}
        }
        async function openWorkerDocument(id,docId) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id),d=e?.documents?.find(d=>d.id===docId);if(!d)return;
            if(!d.path.startsWith(workspaceOwnerId+'/'))return showToast('This document belongs to another workspace.','warning');
            const {data,error}=await supabaseClient.storage.from('worker-documents').createSignedUrl(d.path,60);
            if(error)return showToast(error.message,'danger');
            openModal('Open private document',`<p>${safe(d.name)}</p><p class="small text-muted">This private link expires in 60 seconds.</p><a class="btn btn-primary" href="${safe(data.signedUrl)}" target="_blank" rel="noopener noreferrer">Open document</a>`);
        }
        async function setDocumentArchived(id,docId,archived) {
            if(!requireWrite())return;const employees=structuredClone(getData(STORAGE_KEYS.EMPLOYEES)||[]),d=employees.find(e=>e.id===id)?.documents?.find(d=>d.id===docId);if(!d)return;d.archived=archived;
            if(await persistEmployeesSafely(employees)){renderPage(currentPage);showToast(archived?'Document archived. File retained.':'Document restored.');}
        }
        function archiveWorkerDocument(id,docId){return setDocumentArchived(id,docId,true);}
        function restoreWorkerDocument(id,docId){return setDocumentArchived(id,docId,false);}
        function daysUntil(date,today=new Date()) {
            if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
            const [y,m,d]=date.split('-').map(Number),target=new Date(Date.UTC(y,m-1,d));if(target.getUTCMonth()!==m-1||target.getUTCDate()!==d)return null;
            return Math.round((target.getTime()-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
        }
        function workerReminders(today=new Date()) {
            const rows=[];
            (getData(STORAGE_KEYS.EMPLOYEES)||[]).filter(e=>!e.archived&&!['Inactive','Transferred','Final Exit'].includes(e.employmentStatus)).forEach(e=>{
                const add=(type,date)=>{const days=daysUntil(date,today);if(days!==null&&days<=60)rows.push({workerId:e.id,name:e.fullName,iqama:e.iqamaNumber,workerType:workerType(e),type,date,days});};
                add('Iqama',e.idExpiryDate);
                if(['Issued','Outside KSA'].includes(e.exitReentry?.status))add('Visa return',e.exitReentry.returnBy);
            });return rows.sort((a,b)=>a.days-b.days);
        }
        function renderReminders(container) {
            const rows=workerReminders();
            container.innerHTML=`<section class="lookup-hero mb-4"><span class="eyebrow">DATES & FOLLOW-UP</span><h2>${label('Nothing important slips past.','تابع المواعيد المهمة.')}</h2><p class="mb-0">In-app reminders for expired or upcoming Iqamas and return dates within 60 days. Updated whenever you open the site. No background messages are sent.</p></section><div class="row g-3 mb-4">${[['Overdue',rows.filter(r=>r.days<0).length],['Due in 7 days',rows.filter(r=>r.days>=0&&r.days<=7).length],['8–30 days',rows.filter(r=>r.days>7&&r.days<=30).length],['31–60 days',rows.filter(r=>r.days>30).length]].map(([t,n])=>`<div class="col-6 col-xl-3"><div class="account-metric"><span>${t}</span><strong>${n}</strong></div></div>`).join('')}</div><div class="row g-2 mb-3"><div class="col-md-6"><input id="reminderSearch" class="form-control" placeholder="Search Iqama / Name" oninput="filterReminders()"></div><div class="col-md-3"><select id="reminderType" class="form-select" onchange="filterReminders()"><option value="">All reminders</option><option>Iqama</option><option>Visa return</option></select></div><div class="col-md-3"><select id="reminderWindow" class="form-select" onchange="filterReminders()"><option value="60">Within 60 days + overdue</option><option value="30">Within 30 days + overdue</option><option value="7">Within 7 days + overdue</option><option value="-1">Overdue only</option></select></div></div><div class="dashboard-card table-responsive"><table class="table"><thead><tr><th>Worker / Iqama</th><th>Reminder</th><th>Date</th><th>Days</th><th>Action</th></tr></thead><tbody id="reminderRows"></tbody></table></div>`;filterReminders();
        }
        function filterReminders() {
            const q=normalizeWorkerSearch(document.getElementById('reminderSearch').value),type=document.getElementById('reminderType').value,limit=Number(document.getElementById('reminderWindow').value);
            const rows=workerReminders().filter(r=>(!type||r.type===type)&&(limit===-1?r.days<0:r.days<=limit)&&[r.name,r.iqama].some(v=>normalizeWorkerSearch(v).includes(q)));
            document.getElementById('reminderRows').innerHTML=rows.map(r=>`<tr><td>${safe(r.name)}<div class="small text-muted">${safe(r.iqama)}</div></td><td>${safe(r.type)}</td><td>${safe(r.date)}</td><td class="${r.days<0?'text-danger fw-bold':''}">${r.days<0?Math.abs(r.days)+' days overdue':r.days+' days'}</td><td><button class="btn btn-sm btn-outline-primary" onclick="viewEmployeeDetails('${safe(r.workerId)}')">Profile</button> <button class="btn btn-sm btn-success" onclick="openWhatsAppDraft('${safe(r.workerId)}')">Draft</button></td></tr>`).join('')||'<tr><td colspan="5" class="text-center p-4 text-muted">No reminders matching this filter.</td></tr>';
        }
        function refreshReminderBell() {
            const rows=workerReminders(),dot=document.getElementById('notificationDot'),items=document.getElementById('notificationItems');
            if(dot)dot.classList.toggle('d-none',!rows.length);
            if(items)items.innerHTML=rows.length?`<button class="dropdown-item small text-wrap" onclick="navigateTo('reminders')">${rows.length} Iqama / visa date reminders. View all →</button>`:'<div class="small text-muted p-2">No date reminders within 60 days.</div>';
        }
        function whatsappPhone(raw) {
            let value=normalizeWorkerSearch(raw).replace(/[\s()+-]/g,'');if(value.startsWith('00'))value=value.slice(2);if(/^05\d{8}$/.test(value))value='966'+value.slice(1);
            return /^[1-9]\d{7,14}$/.test(value)?value:'';
        }
        function draftText(e,kind,lang) {
            const a=workerAccount(e.id),n=e.fullName||'',id=e.iqamaNumber||'',business=(getData(STORAGE_KEYS.SETTINGS)||defaultSettings).businessName;
            if(kind==='balance')return lang==='bn'?`আসসালামু আলাইকুম ${n}, আপনার ইকামা ${id}। আমাদের সংরক্ষিত হিসাবে মোট পাওনা ${money(a.expected)} SAR, জমা ${money(a.paid)} SAR এবং বাকি ${money(a.balance)} SAR। অনুগ্রহ করে হিসাব মিলিয়ে যোগাযোগ করুন। ধন্যবাদ।\n${business}`:lang==='ar'?`السلام عليكم ${n}، رقم الإقامة ${id}. حسب سجلاتنا: إجمالي المستحقات ${money(a.expected)} ريال، المدفوع ${money(a.paid)} ريال، والمتبقي ${money(a.balance)} ريال. يرجى مراجعة الحساب والتواصل معنا. شكراً.\n${business}`:`Hello ${n}, Iqama ${id}. Our recorded account shows dues of ${money(a.expected)} SAR, payments of ${money(a.paid)} SAR and an outstanding balance of ${money(a.balance)} SAR. Please review and contact us. Thank you.\n${business}`;
            const date=kind==='visa'?e.exitReentry?.returnBy:e.idExpiryDate;if(!date)return lang==='bn'?'এই তারিখটি কর্মীর প্রোফাইলে দেওয়া নেই।':lang==='ar'?'لم يتم تسجيل هذا التاريخ في ملف العامل.':'This date is not recorded in the worker profile.';
            return lang==='bn'?`আসসালামু আলাইকুম ${n}, ইকামা ${id}। ${kind==='visa'?'আপনার এক্সিট রি-এন্ট্রি ভিসার ফেরার শেষ তারিখ':'আপনার ইকামার মেয়াদ শেষের তারিখ'} ${date}। অনুগ্রহ করে সময়মতো প্রয়োজনীয় ব্যবস্থা নিন।\n${business}`:lang==='ar'?`السلام عليكم ${n}، رقم الإقامة ${id}. ${kind==='visa'?'آخر موعد للعودة حسب السجل':'تاريخ انتهاء الإقامة'}: ${date}. يرجى اتخاذ الإجراءات اللازمة في الوقت المناسب.\n${business}`:`Hello ${n}, Iqama ${id}. Your recorded ${kind==='visa'?'visa return deadline':'Iqama expiry date'} is ${date}. Please arrange the necessary action in time.\n${business}`;
        }
        function openWhatsAppDraft(id) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id);if(!e)return;
            openModal('WhatsApp Message Draft',`<p>${safe(e.fullName)} · ${safe(e.phone)}</p><div class="row g-2 mb-3"><div class="col-6"><label for="draftKind" class="form-label">Message</label><select id="draftKind" class="form-select" onchange="updateWhatsAppDraft('${safe(id)}')"><option value="balance">Outstanding balance</option><option value="iqama">Iqama expiry</option><option value="visa">Visa return date</option></select></div><div class="col-6"><label for="draftLang" class="form-label">Language</label><select id="draftLang" class="form-select" onchange="updateWhatsAppDraft('${safe(id)}')"><option value="bn">বাংলা</option><option value="en">English</option><option value="ar">العربية</option></select></div></div><label class="form-label" for="whatsappDraftText">Review / edit the message</label><textarea id="whatsappDraftText" rows="7" class="form-control mb-3" oninput="refreshWhatsAppLink('${safe(id)}')"></textarea><div class="d-flex gap-2"><button class="btn btn-outline-primary" onclick="copyWhatsAppDraft()">Copy draft</button><a id="whatsappDraftLink" class="btn btn-success" target="_blank" rel="noopener noreferrer">Open WhatsApp</a></div><p id="whatsappPhoneWarning" class="small text-danger mt-2"></p><p class="small text-muted mt-3 mb-0">Opening WhatsApp shares this draft with WhatsApp. Review it there and press Send yourself. This website never sends automatically.</p>`);updateWhatsAppDraft(id);
        }
        function updateWhatsAppDraft(id) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id);if(!e)return;
            document.getElementById('whatsappDraftText').value=draftText(e,document.getElementById('draftKind').value,document.getElementById('draftLang').value);refreshWhatsAppLink(id);
        }
        function refreshWhatsAppLink(id) {
            const e=(getData(STORAGE_KEYS.EMPLOYEES)||[]).find(e=>e.id===id),phone=whatsappPhone(e?.phone),link=document.getElementById('whatsappDraftLink');
            link.classList.toggle('disabled',!phone);if(phone)link.href=`https://wa.me/${phone}?text=${encodeURIComponent(document.getElementById('whatsappDraftText').value)}`;else link.removeAttribute('href');
            document.getElementById('whatsappPhoneWarning').textContent=phone?'':'Add a valid international phone number to this worker. You can still copy the draft.';
        }
        async function copyWhatsAppDraft() {
            try{await navigator.clipboard.writeText(document.getElementById('whatsappDraftText').value);showToast('Draft copied.');}catch(_){showToast('Select the message and copy it manually.','warning');}
        }

        document.addEventListener('DOMContentLoaded', async () => {
            // Supabase session + cloud data are loaded before the first page render.
            await ensureOnlineData();

            document.getElementById('globalSearch').addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    workerLookupQuery = event.target.value;
                    navigateTo('worker-search');
                    findWorkers(true);
                }
            });

            // Setup Language Toggle Button
            document.getElementById('langSwitchBtn').addEventListener('click', () => {
                const newLang = currentLang === 'en' ? 'ar' : 'en';
                applyLanguage(newLang);
            });

    
        // ===================== DELETE CONTROLS =====================
        // All destructive actions use confirmation and preserve unrelated records.
        function deleteEmployee(id) {
            if (!requireWrite()) return;
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
            if (!requireWrite()) return;
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
            if (!requireWrite()) return;
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
            if (!requireWrite()) return;
            const employees = getData(STORAGE_KEYS.EMPLOYEES) || [];
            if (!employees.length) return showToast('No employees to delete.', 'warning');
            if (!confirm(`Delete ALL ${employees.length} employees permanently?\n\nPayment records will remain.`)) return;
            saveData(STORAGE_KEYS.EMPLOYEES, []);
            logActivity('Delete All Employees', `${employees.length} employee records deleted.`);
            showToast('All employees deleted.', 'warning');
            renderPage(currentPage);
        }

        function deleteAllCompanies() {
            if (!requireWrite()) return;
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
            if (!requireWrite()) return;
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
            supabaseClient.auth.onAuthStateChange((_event, session) => {
                if (_event === 'TOKEN_REFRESHED' && onlineUser?.id === session?.user?.id) return;
                onlineUser = session?.user || null;
                setTimeout(async () => {
                    if (onlineUser) {
                        if (!await loadCloudData()) { showLoginScreen(); return; }
                        hideLoginScreen();updateAdminHeader();renderPage(currentPage);
                    } else {
                        onlineDataReady=false;workspaceRole='viewer';workspaceOwnerId=null;
                        clearWorkspaceCache();selectedWorkerId=null;showLoginScreen();
                    }
                },0);
            });
        });
