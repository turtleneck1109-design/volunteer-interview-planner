const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('./scheduler'),R=require('./records'),B=require('./batches'),A=require('./adjustments'),X=require('./excel-export');
// Read the actual exported ZIP, rather than testing formatting helper internals.
function unpack(bytes){
 const buffer=Buffer.from(bytes),files={};let at=0;
 while(buffer.readUInt32LE(at)===0x04034b50){
  assert.equal(buffer.readUInt16LE(at+8),0);
  const size=buffer.readUInt32LE(at+18),nameSize=buffer.readUInt16LE(at+26),extra=buffer.readUInt16LE(at+28),start=at+30+nameSize+extra;
  files[buffer.toString('utf8',at+30,at+30+nameSize)]=buffer.toString('utf8',start,start+size);at=start+size;
 }
 assert.equal(buffer.readUInt32LE(at),0x02014b50);return files;
}
function inspect(bytes){
 const files=unpack(bytes),style=files['xl/styles.xml'];
 const xfs=style.match(/<x:cellXfs[^>]*>([\s\S]*?)<\/x:cellXfs>/)[1].match(/<x:xf\b[^>]*?(?:\/>|>[\s\S]*?<\/x:xf>)/g);
 const fills=style.match(/<x:fills[^>]*>([\s\S]*?)<\/x:fills>/)[1].match(/<x:fill\b[\s\S]*?<\/x:fill>/g);
 assert.equal(Number(style.match(/<x:cellXfs count="(\d+)"/)[1]),xfs.length);
 assert.equal(Number(style.match(/<x:fills count="(\d+)"/)[1]),fills.length);
 const sheets=[1,2,3].map(i=>files[`xl/worksheets/sheet${i}.xml`]).filter(Boolean);
 return {files,xfs,fills,sheets,
  cell(sheet,ref){return sheets[sheet].match(new RegExp('<x:c r="'+ref+'"[^>]*(?:/>|>[\\s\\S]*?</x:c>)'))[0];},
  style(sheet,ref){return xfs[Number(this.cell(sheet,ref).match(/s="(\d+)"/)[1])];},
  fill(sheet,ref){return fills[Number(this.style(sheet,ref).match(/fillId="(\d+)"/)[1])];},
  widths(sheet){return [...sheets[sheet].matchAll(/<x:col\b[^>]*width="([\d.]+)"/g)].map(m=>Number(m[1]));}
 };
}
const raw=R.empty(2027),windows=[];
for(let day=16;day<=18;day++)for(let hour=18;hour<=20;hour+=2){
 const win=`2027-01-${day} ${hour}:00-${hour+2}:00`;windows.push(win);
 for(let i=0;i<24;i++)raw.candidates.push([String(raw.candidates.length).padStart(12,'0'),'示例候选人'+raw.candidates.length,win,'否']);
}
raw.staff.push(['示例面试官','团队',windows.join('；'),'','I'],['示例场务','团队','',windows.join('；'),'F']);
const data=P.normalize(raw.candidates,raw.staff,[],2027),result=P.solve(data,{waitingRoom:'教学楼 101'}),rows=X.makeRows(data,result)[0],queryRows=B.queryRows(result);
const adminBytes=X.bytes(data,result),queryBytes=X.queryBytes(data,result),admin=inspect(adminBytes),query=inspect(queryBytes);
assert.equal(admin.sheets.length,3);assert.equal(query.sheets.length,1);
const byLabel=new Map();
rows.forEach((row,i)=>{
 const fill=admin.fill(0,'A'+(i+5));
 if(byLabel.has(row[11]))assert.equal(fill,byLabel.get(row[11]));else byLabel.set(row[11],fill);
 for(let j=0;j<13;j++)assert.equal(admin.fill(0,String.fromCharCode(65+j)+(i+5)),fill);
});
assert.equal(byLabel.size,36);assert.equal(new Set(byLabel.values()).size,36);
queryRows.forEach((row,i)=>assert.equal(query.fill(0,'A'+(i+2)),byLabel.get(row[0])));
// Text IDs and numeric date/time/duration formats survive adding a batch fill.
assert.match(admin.cell(0,'A5'),/t="s"/);assert.match(admin.cell(0,'E5'),/t="n"/);
for(const [ref,id] of [['A5',200],['E5',201],['F5',202],['H5',203]])assert.match(admin.style(0,ref),new RegExp(`numFmtId="${id}"`));
assert.ok(query.files['xl/sharedStrings.xml'].includes('000000000001'));
for(const sheet of admin.sheets)assert.ok(sheet.includes('<x:autoFilter')&&sheet.includes('state="frozen"'));
assert.ok(query.widths(0)[0]>=24);assert.ok(query.widths(0)[3]>=15);
const longData=structuredClone(data);longData.candidates[0].name='=1+1 & <示例>';longData.staff.forEach(p=>p.department='这是较长的示例学院志愿者服务团队');
const longResult=P.solve(longData,{waitingRoom:'很长的候场地点说明'.repeat(10)}),longAdmin=inspect(X.bytes(longData,longResult)),longQuery=inspect(X.queryBytes(longData,longResult));
assert.equal(longQuery.widths(0)[1],60);assert.ok(longAdmin.widths(1)[4]>admin.widths(1)[4]);assert.ok(longAdmin.widths(2)[4]>admin.widths(2)[4]);
assert.ok(Number(longQuery.sheets[0].match(/<x:row r="2" ht="([\d.]+)"/)[1])>26);
assert.ok(longAdmin.files['xl/sharedStrings.xml'].includes('=1+1 &amp; &lt;示例&gt;'));assert.ok(!longAdmin.sheets[0].includes('<x:f>'));
// Explicit newlines expand row height even when each line fits the column.
const newline=inspect(X.queryBytes(data,P.solve(data,{waitingRoom:'教学楼\n一层 101'})));
assert.ok(Number(newline.sheets[0].match(/<x:row r="2" ht="([\d.]+)"/)[1])>=40);
// Re-exporting a manually changed arrival uses its new batch color.
const movedId=data.candidates[0].id,session=data.sessions[0];
const changes={[movedId]:{session:session.id,interviewer:'I',startSeconds:session.start*60+25*60,endSeconds:session.start*60+30*60}};
const moved=B.apply(A.apply(data,P.solve(data,{adjustments:changes}),changes)),movedRows=B.queryRows(moved),movedExport=inspect(X.queryBytes(data,moved));
const movedIndex=movedRows.findIndex(row=>row[3]===movedId),peer=movedRows.findIndex((row,i)=>i!==movedIndex&&row[0]===movedRows[movedIndex][0]);
assert.ok(peer>=0);assert.equal(movedExport.fill(0,'A'+(movedIndex+2)),movedExport.fill(0,'A'+(peer+2)));
const pending=inspect(X.queryBytes(data,P.solve(data,{enabled:[]})));assert.match(pending.fill(0,'A2'),/FFF1F5F9/);
const empty=R.empty(2027),emptyData=P.normalize(empty.candidates,empty.staff,[],2027);
for(const bytes of [X.bytes(emptyData,P.solve(emptyData)),X.queryBytes(emptyData,P.solve(emptyData))]){
 const output=inspect(bytes);for(let i=0;i<output.sheets.length;i++)assert.ok(output.widths(i).every(w=>Number.isFinite(w)&&w>=10));
}
const exactRows=B.queryRows({...result,config:{...result.config,arrivalMode:'exact'}}),exact=inspect(X.queryBytes(data,{...result,config:{...result.config,arrivalMode:'exact'}}));
assert.notEqual(exactRows[0][0],exactRows[1][0]);assert.notEqual(exact.fill(0,'A2'),exact.fill(0,'A3'));
if(process.env.EXPORT_PREVIEW_DIR){
 fs.mkdirSync(process.env.EXPORT_PREVIEW_DIR,{recursive:true});
 for(const [name,bytes] of [['admin',adminBytes],['query',queryBytes],['long-admin',X.bytes(longData,longResult)],['long-query',X.queryBytes(longData,longResult)]])fs.writeFileSync(path.join(process.env.EXPORT_PREVIEW_DIR,name+'.xlsx'),bytes);
}
console.log('PASS: 36 batch colors, consistent query/admin fills, manual moves, typed formats, dynamic widths on all sheets, long/multiline text, pending and empty exports.');
