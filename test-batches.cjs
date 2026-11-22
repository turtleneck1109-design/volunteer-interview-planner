const assert=require('node:assert/strict'),P=require('./scheduler.js'),R=require('./records.js'),A=require('./adjustments.js'),B=require('./batches.js'),X=require('./excel-export.js');
const raw=R.empty(2027),win='2027-01-16 18:00-19:05';
raw.candidates.push(...Array.from({length:13},(_,i)=>[String(i).padStart(6,'0'),'候选人'+i,win,i===0?'是':'否']));raw.staff.push(['面试官','',win,'','I']);
const d=P.normalize(raw.candidates,raw.staff,[],2027),auto=P.solve(d,{field:0}),source=JSON.stringify(auto);
const r=B.apply(auto);assert.equal(r.config.batchMinutes,20);assert.equal(r.batches.length,4);assert.deepEqual(r.batches.map(b=>b.count),[4,4,4,1]);
assert.equal(r.batches.at(-1).label,'2027-01-16 19:00–19:05');assert.equal(r.averageDuration,auto.averageDuration);assert.equal(r.matched,13);assert.equal(JSON.stringify(auto),source);
for(const a of r.assignments){assert.ok(a.batchStartSeconds<=a.startSeconds&&a.startSeconds<a.batchEndSeconds);assert.ok(a.batchStartSeconds>=d.sessions[0].start*60);assert.equal(a.startSeconds,auto.assignments.find(v=>v.id===a.id).startSeconds);}
const boundary=r.assignments.find(a=>a.startSeconds===18*3600+20*60);assert.equal(boundary.batchStartSeconds,18*3600+20*60);
const cfg={...auto.config,batchMinutes:15,waitingRoom:'默认教室',dateRooms:{'2027-01-16':'当日教室'}};
const fifteen=B.apply({...auto,config:cfg});assert.deepEqual(fifteen.batches.map(b=>b.count),[3,3,3,3,1]);
assert.equal(fifteen.assignments.find(a=>a.online).waitingRoom,'线上等候');assert.equal(fifteen.assignments.find(a=>!a.online).waitingRoom,'当日教室');
assert.equal(B.apply({...auto,config:{...cfg,dateRooms:{'2027-01-16':' '}}}).assignments.find(a=>!a.online).waitingRoom,'默认教室');
const exact=B.apply({...auto,config:{...cfg,arrivalMode:'exact'}});assert.equal(exact.assignments[0].arrivalLabel,'2027-01-16 18:00–18:05');
assert.deepEqual(B.apply({...auto,config:JSON.parse(JSON.stringify(cfg))}).assignments,fifteen.assignments);
const query=B.queryRows(fifteen);assert.equal(query.length,13);assert.ok(query.every(r=>r.length===4));assert.equal(query[0][3],'000000');
const admin=X.makeRows(d,fifteen);assert.equal(admin[0][0][11],query[0][0]);assert.equal(admin[0][0][12],query[0][1]);assert.equal(admin[1][0][5],13);
assert.equal(X.queryBytes(d,fifteen).slice(0,2).toString(),'80,75');assert.equal(X.bytes(d,fifteen).slice(0,2).toString(),'80,75');
for(const n of [0,-1,1.5,241,NaN])assert.throws(()=>B.apply({...auto,config:{...auto.config,batchMinutes:n}}),/批次间隔/);
// Anchors follow each availability segment, not the wall clock or another day.
const session={id:'odd',date:'2027-02-03',start:9*60+10,end:10*60+5};
assert.equal(B.windowFor(session,9*3600+29*60,{batchMinutes:20,reserve:5}).label,'2027-02-03 09:10–09:30');
assert.equal(B.windowFor(session,9*3600+59*60,{batchMinutes:20,reserve:5}).label,'2027-02-03 09:50–10:00');
assert.equal(B.windowFor({id:'night',date:'2027-02-03',start:23*60,end:1440},86399,{batchMinutes:20,reserve:0}).label,'2027-02-03 23:40–24:00');
// After a manual move the query uses the new batch, preserving all exact times.
const demo=require('./demo.json'),dd=P.normalize(demo.candidates,demo.staff,[],demo.year),base=P.solve(dd),s=dd.sessions[0];
const changes={DEMO003:{session:s.id,interviewer:base.sessions[0].interviewers[0].id,startSeconds:s.start*60+45*60+1,endSeconds:s.start*60+49*60+3}};
const moved=B.apply(A.apply(dd,P.solve(dd,{adjustments:changes}),changes)),person=moved.assignments.find(c=>c.id==='DEMO003');assert.equal(person.batchLabel,'2027-01-16 09:40–10:00');assert.equal(person.durationSeconds,242);
assert.equal(B.queryRows(moved).find(r=>r[3]==='DEMO003')[0],person.batchLabel);assert.deepEqual(P.validate(dd,moved),[]);
// Pending candidates remain visible in the four-column query rather than disappearing.
const pending=P.solve(d,{field:1});assert.equal(B.queryRows(pending).length,13);assert.ok(B.queryRows(pending).every(r=>r[0]==='待安排'&&r[1]===''));
const blank=R.empty(2027),bd=P.normalize(blank.candidates,blank.staff,[],2027);assert.deepEqual(B.queryRows(P.solve(bd)),[]);
// Available time is computed per arrival window, including unused windows.
assert.deepEqual(r.availableBatches.map(b=>[b.count,b.average]),[[4,5],[4,5],[4,5],[1,5]]);
assert.deepEqual(fifteen.availableBatches.map(b=>b.average),[5,5,5,5,5]);
assert.ok(moved.availableBatches.find(b=>b.id===person.batchId).count>=1);
assert.equal(moved.availableBatches.find(b=>b.id===person.batchId).budgetMinutes,60);
assert.ok(moved.availableBatches.some(b=>!b.count&&b.average===null&&b.budgetMinutes>0));
const reserved=B.apply(P.solve(d,{field:0,reserve:5}));assert.equal(reserved.availableBatches.length,3);assert.equal(reserved.availableBatches.at(-1).endSeconds,19*3600);
assert.equal(reserved.availableBatches.reduce((sum,b)=>sum+b.budgetMinutes,0),reserved.sessions[0].budgetMinutes);
const disabled=B.apply(P.solve(d,{enabled:[],field:0}));assert.ok(disabled.availableBatches.every(b=>!b.enabled&&b.count===0&&b.average===null&&b.budgetMinutes===0));
assert.ok(B.apply(pending).availableBatches.every(b=>!b.covered&&b.budgetMinutes===0));
assert.deepEqual(B.apply(P.solve(bd)).availableBatches,[]);
// A required gap can straddle a window: subtract only its overlapping minutes.
const gapRaw=R.empty(2027),gapWin='2027-01-16 18:00-18:50';
gapRaw.candidates.push(...Array.from({length:3},(_,i)=>['gap'+i,'间隔候选人'+i,gapWin,'否']));gapRaw.staff.push(['间隔面试官','',gapWin,'','G']);
const gapData=P.normalize(gapRaw.candidates,gapRaw.staff,[],2027),gapped=B.apply(P.solve(gapData,{field:0,gap:17}));
assert.ok(Math.abs(gapped.availableBatches[0].budgetMinutes-16/3)<1/60);assert.ok(gapped.availableBatches.every(b=>b.budgetMinutes>0));assert.deepEqual(gapped.availableBatches.map(b=>b.count),[1,1,1]);
assert.equal(gapped.availableBatches.reduce((sum,b)=>sum+b.budgetMinutes,0),gapped.sessions[0].budgetMinutes);
assert.equal(JSON.stringify(auto),source);
console.log('PASS: per-batch availability, unused/disabled windows, partial final windows, reserve, manual moves and gaps across boundaries.');
console.log('PASS: configurable arrival batches, exact boundaries, room overrides, online/pending notices, manual updates, unchanged interview statistics and query/export rows.');
