const assert=require('node:assert/strict'),fs=require('node:fs'),P=require('./scheduler.js'),R=require('./records.js'),X=require('./excel-export.js');
require('./test-adjustments.cjs');
require('./test-batches.cjs');
const demo=require('./demo.json');
const norm=raw=>P.normalize(raw.candidates,raw.staff,raw.sources,raw.year);
const check=(raw,config={})=>{const d=norm(raw),r=P.solve(d,config);assert.deepEqual(P.validate(d,r),[]);assert.equal(r.matched+r.unassigned.length,d.candidates.length);return r;};
let raw=R.canonical(demo);assert.equal(check(raw).matched,36);
const original=JSON.stringify(raw);raw=R.change(raw,'candidates',null,['00001','新增候选人','2027-01-16 09:00-11:00','是']);assert.equal(check(raw).matched,37);assert.equal(raw.candidates.at(-1)[0],'00001');
assert.equal(JSON.stringify(R.canonical(demo)),original);
raw=R.change(raw,'candidates','00001',['00002','修改后的名字','2027-01-17 09:00-11:00','否']);assert.equal(check(raw).assignments.find(a=>a.id==='00002').online,false);
const before=JSON.stringify(raw);assert.throws(()=>R.change(raw,'candidates','00002',['DEMO001','重复编号','','否']),/重复/);assert.equal(JSON.stringify(raw),before);
assert.throws(()=>R.change(raw,'candidates','00002',['00002','错误日期','2027-02-30 09:00-11:00','否']),/日期无效/);
assert.throws(()=>R.change(raw,'candidates','00002',['00002','倒序时间','2027-01-16 20:00-18:00','否']),/时间范围/);
assert.throws(()=>R.change(raw,'candidates','00002',['00002','面试官1','','否']),/同名/);
const stableIds=norm(raw).staff.map(p=>p.id);raw=R.remove(raw,'staff',[stableIds[0]]);assert.deepEqual(norm(raw).staff.map(p=>p.id),stableIds.slice(1));
raw=R.change(raw,'staff',stableIds[1],['面试官改名','新部门','2027-01-16 09:00-11:00','','demo-staff-2']);assert.equal(norm(raw).staff[0].id,'demo-staff-2');check(raw);
raw=R.change(raw,'staff',null,['新增场务','团队','','2027-01-16 09:00-11:00','new-field']);check(raw);
const count=raw.candidates.length;raw=R.remove(raw,'candidates',['DEMO001','DEMO002','00002']);assert.equal(raw.candidates.length,count-3);check(raw);
const blank=R.empty(2027);assert.equal(check(blank).matched,0);assert.equal(check({...blank,candidates:demo.candidates}).unassigned.length,36);check({...blank,staff:demo.staff});
raw=R.remove(raw,'candidates',norm(raw).candidates.map(p=>p.id));raw=R.remove(raw,'staff',norm(raw).staff.map(p=>p.id));assert.equal(check(raw).total,0);
// Disabled windows stay disabled when edits split an interval; stable roles survive row removal.
const d=norm(demo),cfg={...P.solve(d).config,enabled:d.sessions.slice(1).map(s=>s.id),overrides:{[d.staff[1].id+'|'+d.sessions[1].id]:'off'}};
let split=R.change(demo,'candidates','DEMO001',['DEMO001','候选人01','2027-01-16 09:30-10:30','否']);split=R.remove(split,'staff',[d.staff[0].id]);const nd=norm(split),reconciled=R.reconcile(cfg,d,nd);
assert.ok(nd.sessions.filter(s=>s.date==='2027-01-16'&&s.start<11*60).every(s=>!reconciled.enabled.includes(s.id)));
assert.equal(reconciled.overrides[d.staff[1].id+'|'+d.sessions[1].id],'off');check(split,reconciled);
// More people than the 5-minute reference allows: shorten, do not discard candidates.
const overloaded=R.empty(2027),win='2027-01-16 09:00-11:00';overloaded.candidates.push(...Array.from({length:31},(_,i)=>['V'+i,'测试'+i,win,'否']));overloaded.staff.push(['面试员','',win,'','I']);
const squeezed=check(overloaded,{field:0});assert.equal(squeezed.matched,31);assert.equal(squeezed.minimumSeconds,232);assert.equal(squeezed.compressedCount,31);
const gap=check(overloaded,{field:0,gap:2,reserve:10});assert.equal(gap.matched,31);assert.equal(gap.minimumSeconds,96);
const rows=X.makeRows(norm(overloaded),squeezed);assert.equal(rows[0].length,31);assert.equal(rows[1][0][5],31);assert.ok(Math.abs(rows[1][0][10]-31*232/60)<1e-8);assert.equal(X.bytes(norm(blank),check(blank)).slice(0,2).toString(),'80,75');
// Compare max coverage against independently enumerated tiny bipartite assignments.
let seed=125;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(let t=0;t<30;t++){
 const sessions=P.SESSIONS.slice(0,3),ids=sessions.map(s=>s.id),candidates=Array.from({length:7},(_,i)=>({id:'C'+i,name:'C'+i,slots:ids.filter(()=>rand()>.4),online:false})),staff=Array.from({length:2},(_,i)=>({id:'S'+i,name:'S'+i,interview:ids.filter(()=>rand()>.3),field:[]}));
 const sm={sessions,candidates,staff},r=P.solve(sm,{duration:60,gap:1,reserve:119,field:0});const caps=ids.map(id=>staff.filter(p=>p.interview.includes(id)).length);let best=0;
 function brute(i,n){if(i===candidates.length){best=Math.max(best,n);return;}brute(i+1,n);ids.forEach((id,j)=>{if(caps[j]&&candidates[i].slots.includes(id)){caps[j]--;brute(i+1,n+1);caps[j]++;}});}brute(0,0);assert.equal(r.matched,best);assert.deepEqual(P.validate(sm,r),[]);
}
const html=fs.readFileSync('dist/index.html','utf8');const embedded=JSON.parse(html.match(/<script id="embedded-data" type="application\/json">(.*?)<\/script>/s)[1]);assert.equal(embedded.candidates.length,1);assert.equal(embedded.staff.length,1);assert.ok(!html.includes('NaN'));
console.log('PASS: roster create/update/delete, duplicates, dates, stable staff identity, empty rosters, disabled windows, exact-second scheduling, 30 exhaustive coverage comparisons, Excel totals and empty public build.');
