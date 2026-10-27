const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els={}; const el=id=>els[id]??=( {value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}}});
const ctx={console,structuredClone,crypto:require("crypto").webcrypto,bootstrap:{Modal:class {show(){}}},window:{supabase:{createClient(){return {}}}},document:{addEventListener(){},getElementById:el,querySelector(){return el('tbody')}},localStorage:{getItem(){return null},setItem(){}},setTimeout(){},Date,Number,Math,confirm(){return true}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../assets/js/app.js'),'utf8'),ctx);
vm.runInContext(`
onlineUser={id:'owner-test'};onlineDataReady=true;workspaceOwnerId='owner-test';workspaceRole='owner';
showToast=()=>{};closeModal=()=>{};logActivity=()=>{};renderPage=()=>{};saveData=(key,v)=>dataCache[key]=v;
const d={id:'D1',fullName:'Domestic Test',iqamaNumber:'111',phone:'050',workerType:'domestic',monthlyFee:300,employmentStatus:'Active',idExpiryDate:'2027-01-01'};
const c={id:'C1',fullName:'Company Test',iqamaNumber:'222',phone:'051',monthlyFee:350,employmentStatus:'Active',idExpiryDate:'2027-01-01'};
dataCache[STORAGE_KEYS.EMPLOYEES]=[d,c];dataCache[STORAGE_KEYS.PAYMENTS]=[];dataCache[STORAGE_KEYS.COMPANIES]=[];
currentPage='domestic'; renderEmployees(document.getElementById('test'));
`,ctx);
assert(el('test').innerHTML.includes('Domestic Test'));assert(!el('test').innerHTML.includes('Company Test'));
vm.runInContext("currentPage='employees';renderEmployees(document.getElementById('test'));",ctx);assert(el('test').innerHTML.includes('Company Test'));assert(!el('test').innerHTML.includes('Domestic Test'));
vm.runInContext("generateCurrentMonthPayments('domestic');generateCurrentMonthPayments('domestic');",ctx);
assert.equal(vm.runInContext('getData(STORAGE_KEYS.PAYMENTS).length',ctx),1);assert.equal(vm.runInContext('getData(STORAGE_KEYS.PAYMENTS)[0].expectedAmount',ctx),300);
for(const [k,v]of Object.entries({mPayEmp:'D1',mPayExpected:300,mPayPaid:100,mPayMonth:new Date().getMonth()+1,mPayYear:new Date().getFullYear(),mPayMethod:'Cash',mPayRef:'test'}))el(k).value=v;
vm.runInContext('savePaymentForm({preventDefault(){}})',ctx);assert.equal(vm.runInContext('getData(STORAGE_KEYS.PAYMENTS)[0].balance',ctx),200);
el('mPayPaid').value=200;vm.runInContext('savePaymentForm({preventDefault(){}})',ctx);assert.equal(vm.runInContext('getData(STORAGE_KEYS.PAYMENTS)[0].status',ctx),'PAID');assert.equal(vm.runInContext('getData(STORAGE_KEYS.PAYMENTS).length',ctx),1);
for(const[k,v]of Object.entries({visaIssue:'2026-10-01',visaReturn:'2026-12-01',visaStatus:'Issued',visaNumber:'V123'}))el(k).value=v;
vm.runInContext("saveVisaForm({preventDefault(){}},'D1')",ctx);el('visaSearch').value='111';vm.runInContext('filterVisas()',ctx);assert(el('visaRows').innerHTML.includes('V123'));el('visaSearch').value='222';vm.runInContext('filterVisas()',ctx);assert(!el('visaRows').innerHTML.includes('V123'));
vm.runInContext("openAddEmployeeModal();",ctx);assert(el('appModalContent').innerHTML.includes('mEmpType'));
console.log('PASS: separate directories, legacy company classification, domestic 300 SAR, duplicate generation, partial/full payment, visa save and Iqama search.');
// Full account: preserve old obligation + separate payments; never multiply monthly dues.
vm.runInContext(`
dataCache[STORAGE_KEYS.PAYMENTS]=[
{id:'old0',employeeId:'D1',month:8,year:2026,expectedAmount:300,paidAmount:0,balance:300},
{id:'old1',employeeId:'D1',month:8,year:2026,expectedAmount:300,paidAmount:100,balance:200},
{id:'old2',employeeId:'D1',month:8,year:2026,expectedAmount:300,paidAmount:50,balance:250},
{id:'sep',employeeId:'D1',month:9,year:2026,expectedAmount:300,paidAmount:300,balance:0},
{id:'other',employeeId:'C1',month:9,year:2026,expectedAmount:350,paidAmount:350,balance:0}];
`,ctx);
assert.equal(vm.runInContext("workerAccount('D1').expected",ctx),600);
assert.equal(vm.runInContext("workerAccount('D1').paid",ctx),450);
assert.equal(vm.runInContext("workerAccount('D1').balance",ctx),150);
assert.equal(vm.runInContext("workerAccount('D1').months.length",ctx),2);
assert.equal(vm.runInContext("normalizeWorkerSearch(' ١٢٣۴۵۶ ')",ctx),'123456');
vm.runInContext("selectedWorkerId='D1';renderWorkerProfile(document.getElementById('profile'));",ctx);
assert(el('profile').innerHTML.includes('Domestic Test'));assert(el('profile').innerHTML.includes('150.00'));assert(el('profile').innerHTML.includes('V123'));assert(!el('profile').innerHTML.includes('Company Test'));
// A new payment keeps the detailed entries and rejects amounts exceeding the real legacy balance.
for(const[k,v]of Object.entries({mPayEmp:'D1',mPayExpected:300,mPayPaid:200,mPayMonth:8,mPayYear:2026,mPayMethod:'Cash',mPayRef:'test'}))el(k).value=v;
vm.runInContext('savePaymentForm({preventDefault(){}})',ctx);assert.equal(vm.runInContext("workerAccount('D1').paid",ctx),450);
el('mPayPaid').value=150;vm.runInContext('savePaymentForm({preventDefault(){}})',ctx);assert.equal(vm.runInContext("workerAccount('D1').balance",ctx),0);assert.equal(vm.runInContext("getData(STORAGE_KEYS.PAYMENTS)[0].paymentEvents[0].amount",ctx),150);
vm.runInContext("dataCache[STORAGE_KEYS.EMPLOYEES][0].fullName='<img src=x>';renderWorkerProfile(document.getElementById('profile'));",ctx);assert(el('profile').innerHTML.includes('&lt;img src=x&gt;'));assert(!el('profile').innerHTML.includes('<img src=x>'));
console.log('PASS: multi-month account totals, legacy duplicate obligation handling, isolated worker history, Arabic digits, profile fields, transaction history, overpayment rejection and escaped profile content.');
(async()=>{
 vm.runInContext(`persistEmployeesSafely=async employees=>{dataCache[STORAGE_KEYS.EMPLOYEES]=employees;return true;};`,ctx);
 // Opening balance and old-balance payment should change lifetime totals without changing monthly rows.
 for(const[k,v]of Object.entries({openingAmount:500,openingDate:'2026-07-31',openingNote:'Before monthly system'}))el(k).value=v;
 await vm.runInContext("saveOpeningBalance({preventDefault(){}},'D1')",ctx);
 assert.equal(vm.runInContext("workerAccount('D1').balance",ctx),500);
 for(const[k,v]of Object.entries({oldPayAmount:200,oldPayMethod:'Cash',oldPayReference:'OLD-1'}))el(k).value=v;
 await vm.runInContext("saveOpeningPayment({preventDefault(){}},'D1')",ctx);
 assert.equal(vm.runInContext("workerAccount('D1').balance",ctx),300);
 assert.equal(vm.runInContext("workerAccount('D1').opening.payments.length",ctx),1);
 assert.equal(vm.runInContext("workerAccount('D1').months.length",ctx),2);
 el('oldPayAmount').value=301;await vm.runInContext("saveOpeningPayment({preventDefault(){}},'D1')",ctx);assert.equal(vm.runInContext("workerAccount('D1').opening.paid",ctx),200);
 el('openingAmount').value=100;await vm.runInContext("saveOpeningBalance({preventDefault(){}},'D1')",ctx);assert.equal(vm.runInContext("workerAccount('D1').opening.amount",ctx),500);
 // Viewer guards must stop the same public save functions used by forms.
 vm.runInContext("workspaceRole='viewer'",ctx);el('oldPayAmount').value=100;await vm.runInContext("saveOpeningPayment({preventDefault(){}},'D1')",ctx);assert.equal(vm.runInContext("workerAccount('D1').opening.paid",ctx),200);assert.equal(vm.runInContext('canEditWorkspace()',ctx),false);
 const before=vm.runInContext('JSON.stringify(getData(STORAGE_KEYS.PAYMENTS))',ctx);vm.runInContext("generateCurrentMonthPayments('domestic')",ctx);assert.equal(vm.runInContext('JSON.stringify(getData(STORAGE_KEYS.PAYMENTS))',ctx),before);
 vm.runInContext("workspaceRole='editor'",ctx);assert.equal(vm.runInContext('canEditWorkspace()',ctx),true);
 assert.equal(vm.runInContext("daysUntil('2026-11-03',new Date(2026,9,27))",ctx),7);assert.equal(vm.runInContext("daysUntil('2026-02-30',new Date(2026,9,27))",ctx),null);
 vm.runInContext(`dataCache[STORAGE_KEYS.EMPLOYEES][0].idExpiryDate='2026-11-03';dataCache[STORAGE_KEYS.EMPLOYEES][0].exitReentry={status:'Returned',returnBy:'2026-10-01'};`,ctx);
 assert.equal(vm.runInContext("workerReminders(new Date(2026,9,27)).filter(r=>r.workerId==='D1').length",ctx),1);
 vm.runInContext("dataCache[STORAGE_KEYS.EMPLOYEES][0].exitReentry.status='Outside KSA'",ctx);
 assert.equal(vm.runInContext("workerReminders(new Date(2026,9,27)).filter(r=>r.workerId==='D1').length",ctx),2);
 assert.equal(vm.runInContext("whatsappPhone('٠٥٥٦٣٩٥٣٥٦')",ctx),'966556395356');assert.equal(vm.runInContext("whatsappPhone('bad phone')",ctx),'');
 for(const lang of ['bn','en','ar'])assert(vm.runInContext(`draftText(getData(STORAGE_KEYS.EMPLOYEES)[0],'balance','${lang}')`,ctx).includes('300.00'));
 // Upload an isolated fake file, test MIME/size guards, archive without deleting storage bytes.
 let uploads=0,signed=0;
 ctx.supabaseStorage = { from() { return {
   upload: async () => { uploads++; return {error:null}; },
   createSignedUrl: async (path,expiry) => { signed++; assert.equal(expiry,60); return {data:{signedUrl:'https://example.test/private-doc'},error:null}; }
 }; } };
 vm.runInContext('supabaseClient.storage=supabaseStorage;workspaceUpgradeReady=true;',ctx);
 el('workerDocFile').files=[{name:'test.pdf',type:'application/pdf',size:100}];el('docType').value='Iqama';
 await vm.runInContext("uploadWorkerDocument('D1')",ctx);assert.equal(uploads,1);assert.equal(vm.runInContext("getData(STORAGE_KEYS.EMPLOYEES)[0].documents.length",ctx),1);
 const docid=vm.runInContext("getData(STORAGE_KEYS.EMPLOYEES)[0].documents[0].id",ctx);
 await vm.runInContext(`openWorkerDocument('D1','${docid}')`,ctx);assert.equal(signed,1);
 await vm.runInContext(`archiveWorkerDocument('D1','${docid}')`,ctx);assert.equal(vm.runInContext("getData(STORAGE_KEYS.EMPLOYEES)[0].documents[0].archived",ctx),true);
 el('workerDocFile').files=[{name:'bad.html',type:'text/html',size:100}];await vm.runInContext("uploadWorkerDocument('D1')",ctx);assert.equal(uploads,1);
 el('workerDocFile').files=[{name:'big.pdf',type:'application/pdf',size:10485761}];await vm.runInContext("uploadWorkerDocument('D1')",ctx);assert.equal(uploads,1);
 vm.runInContext("workspaceRole='viewer'",ctx);el('workerDocFile').files=[{name:'test.pdf',type:'application/pdf',size:100}];await vm.runInContext("uploadWorkerDocument('D1')",ctx);assert.equal(uploads,1);
 console.log('PASS: opening dues and partial payments, no double monthly charge, old-balance overpayment rejection, viewer mutation guards, reminder dates/status, multilingual WhatsApp drafts, phone normalization, private upload/link/archive and file restrictions.');
})().catch(error=>{console.error(error);process.exitCode=1});
