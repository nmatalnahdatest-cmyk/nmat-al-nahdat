const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../assets/js/app.js'),'utf8');
async function scenario({role='viewer',membershipError=null,rows=[],cacheOwner='old-owner'}) {
 const memory=new Map([['nmat_cache_owner',cacheOwner],['nmat_cache_user','old-user'],['saudi_ems_employees',JSON.stringify([{id:'secret-old-worker'}])]]);let writes=[];
 const supa = { from(table) { return {
   select() { return { async eq() {
     return table === 'workspace_members'
       ? {data:membershipError ? null : [{workspace_owner_id:'shared-owner',role}],error:membershipError}
       : {data:rows,error:null};
   } }; },
   async upsert(value) { writes.push(value); return {error:null}; }
 }; } };
 const ctx={console,window:{supabase:{createClient:()=>supa}},document:{addEventListener(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},Date,Number,Math,setTimeout,structuredClone};vm.createContext(ctx);vm.runInContext(source,ctx);
 vm.runInContext("onlineUser={id:'signed-in-user'};showToast=()=>{};",ctx);
 const loaded=await vm.runInContext('loadCloudData()',ctx);return{ctx,writes,memory,loaded};
}
(async()=>{
 let r=await scenario({});assert(r.loaded);assert.equal(vm.runInContext('workspaceRole',r.ctx),'viewer');assert.equal(vm.runInContext('getData(STORAGE_KEYS.EMPLOYEES).length',r.ctx),0);assert.equal(r.writes.length,0);assert.equal(vm.runInContext("syncDataKey(STORAGE_KEYS.EMPLOYEES,[])",r.ctx) instanceof Promise,false); // cross-context Promise
 assert.equal(await vm.runInContext("syncDataKey(STORAGE_KEYS.EMPLOYEES,[])",r.ctx),false);
 r=await scenario({role:'editor',rows:[{data_key:'saudi_ems_employees',data_value:[{id:'shared-worker'}]}]});assert(r.loaded);assert.equal(vm.runInContext('getData(STORAGE_KEYS.EMPLOYEES)[0].id',r.ctx),'shared-worker');assert(await vm.runInContext("syncDataKey(STORAGE_KEYS.EMPLOYEES,[])",r.ctx));assert.equal(r.writes[0].user_id,'shared-owner');
 r=await scenario({membershipError:{code:'PGRST205',message:'table missing'}});assert(r.loaded);assert.equal(vm.runInContext('workspaceRole',r.ctx),'owner');assert.equal(vm.runInContext('workspaceUpgradeReady',r.ctx),false);assert.equal(r.writes.length,0);
 r=await scenario({membershipError:{code:'NETWORK',message:'offline'}});assert.equal(r.loaded,false);assert.equal(vm.runInContext('onlineDataReady',r.ctx),false);
 console.log('PASS: shared viewer isolation, stale cache removal, editor writes target correct owner, safe pre-upgrade fallback, network failure blocks workspace.');
})().catch(e=>{console.error(e);process.exitCode=1});
