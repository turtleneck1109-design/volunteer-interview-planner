const assert=require('node:assert/strict'),P=require('./scheduler.js'),R=require('./records.js'),A=require('./adjustments.js'),X=require('./excel-export.js');
const first='2027-01-16 09:00-10:00',second='2027-01-17 14:00-15:00',both=first+'、'+second;
const raw=R.empty(2027);raw.candidates.push(['001','甲',both,'否'],['002','乙',first,'是'],['003','丙',both,'否']);
raw.staff.push(['面试员甲','团队',both,'','I1'],['面试员乙','团队',both,'','I2'],['场务甲','团队','',both,'F1']);
const d=P.normalize(raw.candidates,raw.staff,[],2027),base=P.solve(d),original=JSON.stringify(base),last=d.sessions[1];
const manual={'001':{session:last.id,interviewer:'I2',startSeconds:14*3600+30*60+1,endSeconds:14*3600+34*60+3}};
const changed=A.apply(d,base,manual),a=changed.assignments.find(a=>a.id==='001');
assert.equal(a.startSeconds,52201);assert.equal(a.durationSeconds,242);assert.equal(a.status,'手动调整');assert.equal(changed.manualCount,1);
assert.equal(JSON.stringify(base),original);assert.deepEqual(changed.assignments.filter(a=>a.id!=='001'),base.assignments.filter(a=>a.id!=='001'));
assert.deepEqual(P.validate(d,changed),[]);assert.equal(changed.matched,3);
const session=changed.sessions.find(s=>s.id===last.id),own=changed.assignments.filter(a=>a.session===last.id);
assert.equal(session.count,own.length);assert.equal(session.online,own.filter(a=>a.online).length);assert.equal(session.offline,own.filter(a=>!a.online).length);
assert.equal(session.scheduledAverage,own.reduce((sum,a)=>sum+a.durationSeconds,0)/own.length/60);
for(const w of changed.workloads){const rows=changed.assignments.filter(a=>a.interviewer===w.id);assert.equal(w.count,rows.length);assert.ok(Math.abs(w.interviewMinutes-rows.reduce((sum,a)=>sum+a.durationSeconds,0)/60)<1e-10);}
const excel=X.makeRows(d,changed),out=excel[0].find(r=>r[0]==='001'),interviewer=excel[1].find(r=>r[0]===out[4]&&r[3]==='面试员乙'),field=excel[2].find(r=>r[0]===out[4]);
assert.equal(out[3],'手动调整');assert.equal(out[5],52201/86400);assert.equal(out[6],52443/86400);assert.equal(out[8],'面试员乙');assert.equal(field[6],session.count);assert.equal(field[7],session.offline);assert.equal(interviewer[5],own.filter(a=>a.interviewer==='I2').length);
assert.equal(changed.compressedCount,1);assert.equal(changed.averageDuration,(242+7200)/180);
// Persistence and restoration use exactly the saved manual changes.
const cfg=JSON.parse(JSON.stringify({...base.config,adjustments:manual}));
const restored=A.apply(d,P.solve(d,cfg),cfg.adjustments);assert.equal(restored.assignments.find(a=>a.id==='001').startSeconds,52201);assert.equal(restored.assignments.find(a=>a.id==='001').endSeconds,52443);assert.deepEqual(P.validate(d,restored),[]);assert.equal(restored.matched,3);assert.deepEqual(A.apply(d,P.solve(d,JSON.parse(JSON.stringify(cfg))),cfg.adjustments).assignments,restored.assignments);
assert.deepEqual(A.apply(d,base,{}).assignments,base.assignments);
// Test an occupied slot and the required gap, even when intervals merely touch.
const victim=base.assignments.find(a=>a.id==='002'),where={session:victim.session,interviewer:victim.interviewer,startSeconds:victim.startSeconds,endSeconds:victim.endSeconds};
assert.throws(()=>A.apply(d,base,{'001':where}),/时间冲突/);
const gbase=P.solve(d,{gap:1}),other=gbase.assignments.find(a=>a.id==='002');
assert.throws(()=>A.apply(d,gbase,{'001':{session:other.session,interviewer:other.interviewer,startSeconds:other.startSeconds+1,endSeconds:other.startSeconds+61}}),/间隔/);
const free=A.free(gbase,'001',other.session,other.interviewer);assert.ok(free.every(w=>w.end<=other.startSeconds-60||w.start>=other.endSeconds+60));
// Hard constraints reject bad changes without touching the original schedule.
const fails=(patch,pattern)=>assert.throws(()=>A.apply(d,base,{'001':{...manual['001'],...patch}}),pattern);
fails({interviewer:'F1'},/未担任面试官/);fails({startSeconds:14*3600-1},/超出/);
fails({endSeconds:manual['001'].startSeconds},/结束时间/);fails({startSeconds:NaN},/精确到秒/);
assert.equal(A.apply(d,base,{'001':{...manual['001'],endSeconds:manual['001'].startSeconds+901}}).assignments.find(a=>a.id==='001').durationSeconds,901);fails({session:'missing'},/可用时间/);
assert.throws(()=>A.apply(d,base,{'002':manual['001']}),/可用时间/);
assert.throws(()=>A.apply(d,P.solve(d,{enabled:[d.sessions[0].id]}),manual),/停用/);
assert.throws(()=>A.apply(d,P.solve(d,{field:2}),manual),/场务不足/);
assert.throws(()=>A.apply(d,P.solve(d,{reserve:30}),manual),/末尾预留/);
assert.equal(JSON.stringify(base),original);
assert.equal(A.seconds('18:02:03'),64923);assert.equal(A.seconds('24:00'),86400);
for(const invalid of ['25:00','24:00:01','18:60','1:2','oops'])assert.throws(()=>A.seconds(invalid));
// A pending candidate may be placed in a released second-precision gap.
const crowded=R.empty(2027);crowded.candidates.push(...Array.from({length:3},(_,i)=>['C'+i,'候选'+i,'2027-01-16 09:00-09:01','否']));crowded.staff.push(['面试官','','2027-01-16 09:00-09:01','','I']);
const cd=P.normalize(crowded.candidates,crowded.staff,[],2027),cb=P.solve(cd,{field:0,gap:1});assert.equal(cb.unassigned.length,2);
const pending=cb.unassigned[0];const placed=A.apply(cd,{...cb,config:{...cb.config,gap:0}},{[cb.assignments[0].id]:{session:cd.sessions[0].id,interviewer:'I',startSeconds:32400,endSeconds:32401},[pending.id]:{session:cd.sessions[0].id,interviewer:'I',startSeconds:32401,endSeconds:32402}});
assert.equal(placed.matched,2);assert.equal(placed.unassigned.length,1);assert.deepEqual(P.validate(cd,placed),[]);
// Roster edits keep identities, remap split sessions, and remove deleted candidate overrides.
const renamed=R.change(raw,'candidates','001',['009','改名',both,'否']),rd=P.normalize(renamed.candidates,renamed.staff,[],2027);
const renamedConfig=R.reconcile(cfg,d,rd,{'001':'009'});assert.ok(renamedConfig.adjustments['009']);assert.ok(!renamedConfig.adjustments['001']);
assert.equal(A.apply(rd,P.solve(rd,renamedConfig),renamedConfig.adjustments).assignments.find(a=>a.id==='009').startSeconds,52201);
const removed=R.remove(raw,'candidates',['001']),dd=P.normalize(removed.candidates,removed.staff,[],2027);assert.deepEqual(R.reconcile(cfg,d,dd).adjustments,{});
const split=R.change(raw,'candidates',null,['004','新候选人','2027-01-17 14:20-14:50','否']),sd=P.normalize(split.candidates,split.staff,[],2027),sc=R.reconcile(cfg,d,sd);
assert.ok(sc.adjustments['001'].session.includes('14:20'));assert.equal(A.apply(sd,P.solve(sd,sc),sc.adjustments).assignments.find(a=>a.id==='001').startSeconds,52201);
console.log('PASS: manual rescheduling, exact seconds, conflict/availability/role checks, free intervals, statistics, all export sheets, persisted overrides and roster reconciliation.');
