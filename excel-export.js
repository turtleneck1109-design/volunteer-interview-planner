/* Offline XLSX data export using the pre-authored workbook layout. */
(function(root){
 'use strict';
 const template=typeof module!=='undefined'?require('./excel-template.js'):root.PlannerWorkbookTemplate;
 const esc=v=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const excelDate=date=>(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
 function column(n){let out='';for(n++;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
 function makeRows(data,result){
  const sessions=new Map(result.sessions.map(s=>[s.id,s])),staff=new Map(data.staff.map(p=>[p.id,p]));
  const candidates=[...result.assignments,...result.unassigned].map(c=>{
   const s=sessions.get(c.session);
   return [c.id,c.name,c.online?'线上':'线下',c.status,s?excelDate(s.date):null,s?c.start/1440:null,s?c.end/1440:null,s?c.duration:null,s?staff.get(c.interviewer).name:'',s?s.fieldStaff.map(p=>p.name).join('、'):'',c.reason||''];
  });
  const interviewerRows=[],fieldRows=[];
  for(const s of result.sessions){
   for(const p of s.interviewers){
    const a=result.assignments.filter(a=>a.session===s.id&&a.interviewer===p.id),online=a.filter(a=>a.online).length;
    interviewerRows.push([excelDate(s.date),s.start/1440,s.end/1440,p.name,p.department,a.length,online,a.length-online,a.length?Math.min(...a.map(a=>a.start))/1440:null,a.length?Math.max(...a.map(a=>a.end))/1440:null,a.reduce((total,a)=>total+a.durationSeconds,0)/60,s.warnings.join('；')]);
   }
   for(const p of s.fieldStaff)fieldRows.push([excelDate(s.date),s.start/1440,s.end/1440,p.name,p.department,s.end-s.start,s.count,s.offline,s.interviewers.map(p=>p.name).join('、'),s.warnings.join('；')]);
  }
  return [candidates,interviewerRows,fieldRows];
 }
 function worksheet(spec,rows,summary,intern){
  const original=template.files[spec.path],prefix=original.match(/<x:sheetData>([\s\S]*?)<x:row r="5"/)[1].replace(/<x:row r="3"[\s\S]*?<\/x:row>/,`<x:row r="3" ht="24" customHeight="1"><x:c r="A3" s="7" t="inlineStr"><x:is><x:t xml:space="preserve">${esc(summary)}</x:t></x:is></x:c></x:row>`);
  const body=rows.map((row,i)=>{
   const r=i+5,cells=row.map((v,j)=>{
    const ref=column(j)+r,style=spec.styles[j];
    if(v===null||v===undefined||v==='')return `<x:c r="${ref}" s="${style}"/>`;
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('导出数据含无效数值');return `<x:c r="${ref}" s="${style}" t="n"><x:v>${v}</x:v></x:c>`;}
    // Always explicit text: preserve leading zeros, never turn names into formulas.
    return `<x:c r="${ref}" s="${style}" t="s"><x:v>${intern(String(v))}</x:v></x:c>`;
   }).join('');
   const lines=Math.max(1,...row.map((v,j)=>typeof v==='string'?Math.ceil([...v].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0)/Math.max(1,spec.widths[j]-2)):1));
   return `<x:row r="${r}" ht="${Math.max(26,lines*17+6)}" customHeight="1">${cells}</x:row>`;
  }).join('');
  const last=column(spec.headers.length-1)+(rows.length+4);
  return original.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,`<x:sheetData>${prefix}${body}</x:sheetData><x:autoFilter ref="A4:${last}"/>`).replace('</x:sheetPr>',`</x:sheetPr><x:dimension ref="A1:${last}"/>`);
 }
 const crcTable=Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
 function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 // ZIP STORE keeps the generated workbook dependency-free in both online/offline HTML.
 function zip(files){
  const enc=new TextEncoder(),local=[],central=[];let offset=0,centralSize=0;
  for(const [path,xml] of Object.entries(files)){
   const name=enc.encode(path),body=enc.encode(xml),crc=crc32(body),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
   h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,body.length,true);h.setUint32(22,body.length,true);h.setUint16(26,name.length,true);header.set(name,30);local.push(header,body);
   const record=new Uint8Array(46+name.length),d=new DataView(record.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);record.set(name,46);central.push(record);centralSize+=record.length;offset+=header.length+body.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer),count=Object.keys(files).length;view.setUint32(0,0x06054b50,true);view.setUint16(8,count,true);view.setUint16(10,count,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
  const out=new Uint8Array(offset+centralSize+22);let at=0;for(const p of [...local,...central,end]){out.set(p,at);at+=p.length;}return out;
 }
 function bytes(data,result){
  const rows=makeRows(data,result),files={...template.files},summaries=[
   `当前方案：共 ${result.total} 人，已安排 ${result.matched} 人，待安排 ${result.unassigned.length} 人；参考 ${result.config.duration} 分钟，平均实际 ${result.averageDuration==null?'—':result.averageDuration.toFixed(2)} 分钟 / 人。`,
   `当前方案：共 ${rows[1].length} 个面试官班次；候选人逐人明细见“候选人面试安排”。`,
   `当前方案：共 ${rows[2].length} 个场务班次；场务按生成时段完整值班。`
  ];
  const strings=[],indices=new Map();let stringCount=0;
  const intern=value=>{stringCount++;if(!indices.has(value)){indices.set(value,strings.length);strings.push(value);}return indices.get(value);};
  template.sheets.forEach((s,i)=>files[s.path]=worksheet(s,rows[i],summaries[i],intern));
  files['xl/sharedStrings.xml']=`<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringCount}" uniqueCount="${strings.length}">${strings.map(s=>`<x:si><x:t xml:space="preserve">${esc(s)}</x:t></x:si>`).join('')}</x:sst>`;
  return zip(files);
 }
 root.PlannerExcel={bytes,makeRows};if(typeof module!=='undefined')module.exports=root.PlannerExcel;
})(typeof globalThis!=='undefined'?globalThis:this);
