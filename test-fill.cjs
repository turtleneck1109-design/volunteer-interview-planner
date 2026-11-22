const assert=require('node:assert/strict'),P=require('./scheduler.js'),R=require('./records.js'),B=require('./batches.js'),X=require('./excel-export.js');
function sample(n,m=1,win='2027-01-16 09:00-11:00'){
  const raw=R.empty(2027);raw.candidates.push(...Array.from({length:n},(_,i)=>['C'+i,'候选'+i,win,'否']));raw.staff.push(...Array.from({length:m},(_,i)=>['面试官'+i,'',win,'','I'+i]));return P.normalize(raw.candidates,raw.staff,[],2027);
}
function solve(d,cfg={}){const r=P.solve(d,{field:0,...cfg});assert.deepEqual(P.validate(d,r),[]);assert.equal(r.matched+r.unassigned.length,d.candidates.length);return r;}
const one=solve(sample(1,1,'2027-01-16 09:00-14:00'));
assert.equal(one.averageDuration,300);assert.equal(one.timeUtilization,1);assert.equal(one.assignments[0].endSeconds,14*3600);
const d=sample(5,2),r=solve(d);assert.equal(r.interviewMinutes,240);assert.equal(r.averageDuration,48);assert.deepEqual(r.assignments.map(a=>a.durationSeconds).sort((a,b)=>a-b),[2400,2400,2400,3600,3600]);
assert.deepEqual(solve(d,{duration:1}).assignments,solve(d,{duration:120}).assignments);
const remainder=solve(sample(7));assert.equal(remainder.interviewMinutes,120);assert.equal(remainder.assignments.at(-1).endSeconds,11*3600);assert.ok(Math.max(...remainder.assignments.map(a=>a.durationSeconds))-Math.min(...remainder.assignments.map(a=>a.durationSeconds))<=1);
const gaps=solve(d,{gap:2,reserve:10});assert.equal(gaps.interviewMinutes,214);assert.equal(gaps.availableMinutes,220);assert.ok(Math.abs(gaps.timeUtilization-214/220)<1e-12);
for(const id of ['I0','I1'])assert.equal(Math.max(...gaps.assignments.filter(a=>a.interviewer===id).map(a=>a.endSeconds)),10*3600+50*60);
// Preserve old saved fixed times, filling both sides without overlaps or resets.
const anchoredData=sample(5),slot=anchoredData.sessions[0].id,adjustments={C0:{session:slot,interviewer:'I0',startSeconds:10*3600,endSeconds:10*3600+15*60}};
const anchored=solve(anchoredData,{gap:2,adjustments});assert.equal(anchored.matched,5);assert.equal(anchored.interviewMinutes,112);assert.equal(anchored.manualCount,1);
assert.equal(anchored.assignments.find(a=>a.id==='C0').startSeconds,36000);assert.equal(anchored.assignments.find(a=>a.id==='C0').durationSeconds,900);
assert.deepEqual(solve(anchoredData,JSON.parse(JSON.stringify({gap:2,adjustments}))).assignments,anchored.assignments);
assert.throws(()=>solve(anchoredData,{adjustments:{...adjustments,C1:{...adjustments.C0}}}),/时间冲突/);
const excel=X.makeRows(anchoredData,B.apply(anchored));assert.equal(excel[0].length,5);assert.equal(excel[0].find(row=>row[0]==='C0')[7],15);assert.equal(excel[1][0][10],112);
const batch=B.apply(one);assert.equal(batch.assignments[0].arrivalLabel,'2027-01-16 09:00–09:20');assert.equal(batch.assignments[0].duration,300);
assert.equal(batch.availableBatches[1].count,0);assert.equal(batch.availableBatches[1].ongoingCount,1);
// Exhaustively verify coverage, total time and shortest duration on small graphs.
let seed=981;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(let t=0;t<45;t++){
  const sessions=Array.from({length:3},(_,j)=>({id:'S'+j,date:'2027-01-'+(16+j),start:540,end:541+Math.floor(rand()*4),label:'测试时段'+j}));
  const staff=Array.from({length:2},(_,i)=>({id:'I'+i,name:'面试官'+i,interview:sessions.filter(()=>rand()>.2).map(s=>s.id),field:[]}));
  const candidates=Array.from({length:5},(_,i)=>({id:'C'+i,name:'候选'+i,slots:sessions.filter(()=>rand()>.3).map(s=>s.id),online:false}));
  const gap=t%2,counts=[0,0,0],lanes=sessions.map(s=>staff.filter(p=>p.interview.includes(s.id)).length),seconds=sessions.map(s=>(s.end-s.start)*60);
  const cap=seconds.map((sec,j)=>Math.floor((sec+gap*60)/(1+gap*60))*lanes[j]);let best=[0,0,0];
  function brute(i,flow){
    if(i===candidates.length){
      let total=0,minimum=Infinity;
      counts.forEach((n,j)=>{if(!n)return;total+=Math.min(n,lanes[j])*seconds[j]-Math.max(0,n-lanes[j])*gap*60;const largest=Math.ceil(n/lanes[j]);minimum=Math.min(minimum,Math.floor((seconds[j]-(largest-1)*gap*60)/largest));});
      if(!flow)minimum=0;
      if(flow>best[0]||(flow===best[0]&&(total>best[1]||(total===best[1]&&minimum>best[2]))))best=[flow,total,minimum];return;
    }
    brute(i+1,flow);sessions.forEach((s,j)=>{if(candidates[i].slots.includes(s.id)&&counts[j]<cap[j]){counts[j]++;brute(i+1,flow+1);counts[j]--;}});
  }
  brute(0,0);const result=solve({sessions,staff,candidates},{gap});assert.equal(result.matched,best[0]);assert.equal(Math.round(result.interviewMinutes*60),best[1]);assert.equal(result.minimumSeconds||0,best[2]);
}
console.log('PASS: uncapped time, full lanes, remainder seconds, gaps/reserve, fixed interviews, Excel, and 45 exhaustive coverage/time/fairness comparisons.');
