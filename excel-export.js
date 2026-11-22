/* Offline XLSX data export using the pre-authored workbook layout. */
(function(root){
 'use strict';
 const template=typeof module!=='undefined'?require('./excel-template.js'):root.PlannerWorkbookTemplate;
 const queryTemplate=typeof module!=='undefined'?require('./excel-query-template.js'):root.PlannerQueryTemplate;
 const B=typeof module!=='undefined'?require('./batches.js'):root.Batches;
 const esc=v=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const excelDate=date=>(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
 function column(n){let out='';for(n++;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
 // Excel widths use digit units. Count wide text and explicit line breaks,
 // and measure formatted dates/times instead of their underlying serials.
 const lineWidth=text=>[...text].reduce((n,c)=>n+(/\p{Mark}/u.test(c)?0:c==='\t'?4:c.codePointAt(0)>255?2:1),0);
 const textWidth=value=>Math.max(0,...String(value??'').split(/\r\n|\r|\n/).map(lineWidth));
 function displayValue(value,type){
  if(value==null)return '';
  if(typeof value!=='number')return String(value);
  if(type==='date')return '2000-12-31';
  if(type==='time')return '23:59:59';
  return type==='decimal'?value.toFixed(2):String(value);
 }
 function fittedWidths(spec,rows){
  return spec.headers.map((header,j)=>Math.min(60,Math.max(10,Math.ceil(rows.reduce((width,row)=>Math.max(width,textWidth(displayValue(row[j],spec.types[j]))),textWidth(header)))+3)));
 }
 function arrivalColors(rows,columnIndex){
  const labels=[...new Set(rows.map(row=>row[columnIndex]).filter(label=>label&&label!=='待安排'))].sort();
  // A widely spaced hue sequence keeps neighboring batches distinct. Each
  // full date/time label shares its color across the two export formats.
  const colors=new Map(labels.map((label,i)=>{
   const hue=(210+i*137.508)%360,saturation=.65,lightness=.90;
   const channel=n=>{const k=(n+hue/30)%12,a=saturation*Math.min(lightness,1-lightness);return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};
   return [label,(channel(0)+channel(8)+channel(4)).toUpperCase()];
  }));
  colors.set('待安排','F1F5F9');
  return rows.map(row=>colors.get(row[columnIndex]));
 }
 function exportStyles(files){
  const path='xl/styles.xml',xml=files[path];
  const fills=xml.match(/<x:fills\b[^>]*>([\s\S]*?)<\/x:fills>/)[1].match(/<x:fill\b[\s\S]*?<\/x:fill>/g)||[];
  const xfs=xml.match(/<x:cellXfs\b[^>]*>([\s\S]*?)<\/x:cellXfs>/)[1].match(/<x:xf\b[^>]*?(?:\/>|>[\s\S]*?<\/x:xf>)/g)||[];
  const fillIds=new Map(),styleIds=new Map();
  return {
   tinted(base,color){
    if(!color)return base;
    const key=base+'|'+color;if(styleIds.has(key))return styleIds.get(key);
    if(!fillIds.has(color)){fillIds.set(color,fills.length);fills.push(`<x:fill><x:patternFill patternType="solid"><x:fgColor rgb="FF${color}"/><x:bgColor indexed="64"/></x:patternFill></x:fill>`);}
    const id=xfs.length;xfs.push(xfs[base].replace(/fillId="\d+"/,`fillId="${fillIds.get(color)}"`));styleIds.set(key,id);return id;
   },
   save(){files[path]=xml.replace(/<x:fills\b[^>]*>[\s\S]*?<\/x:fills>/,`<x:fills count="${fills.length}">${fills.join('')}</x:fills>`).replace(/<x:cellXfs\b[^>]*>[\s\S]*?<\/x:cellXfs>/,`<x:cellXfs count="${xfs.length}">${xfs.join('')}</x:cellXfs>`);}
  };
 }
 function makeRows(data,result){
  result=B.apply(result);
  const sessions=new Map(result.sessions.map(s=>[s.id,s])),staff=new Map(data.staff.map(p=>[p.id,p]));
  const candidates=[...result.assignments,...result.unassigned].map(c=>{
   const s=sessions.get(c.session);
   return [c.id,c.name,c.online?'线上':'线下',c.status,s?excelDate(s.date):null,s?c.start/1440:null,s?c.end/1440:null,s?c.duration:null,s?staff.get(c.interviewer).name:'',s?s.fieldStaff.map(p=>p.name).join('、'):'',c.reason||'',c.arrivalLabel||'待安排',c.waitingRoom||''];
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
 function worksheet(layout,spec,rows,summary,intern,styles,colors=[]){
  const first=spec.dataRow||5,header=spec.headerRow||4,original=layout.files[spec.path];
  const widths=fittedWidths(spec,rows);
  let prefix=original.match(new RegExp('<x:sheetData>([\\s\\S]*?)<x:row r="'+first+'"'))[1];
  if(summary)prefix=prefix.replace(/<x:row r="3"[\s\S]*?<\/x:row>/,`<x:row r="3" ht="24" customHeight="1"><x:c r="A3" s="7" t="inlineStr"><x:is><x:t xml:space="preserve">${esc(summary)}</x:t></x:is></x:c></x:row>`);
  const body=rows.map((row,i)=>{
   const r=i+first,cells=row.map((v,j)=>{
    const ref=column(j)+r,style=styles.tinted(spec.styles[j],colors[i]);
    if(v===null||v===undefined||v==='')return `<x:c r="${ref}" s="${style}"/>`;
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('导出数据含无效数值');return `<x:c r="${ref}" s="${style}" t="n"><x:v>${v}</x:v></x:c>`;}
    // Always explicit text: preserve leading zeros, never turn names into formulas.
    return `<x:c r="${ref}" s="${style}" t="s"><x:v>${intern(String(v))}</x:v></x:c>`;
   }).join('');
   const lines=Math.max(1,...row.map((v,j)=>typeof v==='string'?v.split(/\r\n|\r|\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(lineWidth(line)/Math.max(1,widths[j]-3))),0):1));
   return `<x:row r="${r}" ht="${Math.min(409,Math.max(26,lines*17+6))}" customHeight="1">${cells}</x:row>`;
  }).join('');
  const last=column(spec.headers.length-1)+Math.max(header,rows.length+first-1);
  const cols=widths.map((width,j)=>`<x:col min="${j+1}" max="${j+1}" width="${width}" customWidth="1" bestFit="1"/>`).join('');
  return original.replace(/<x:cols>[\s\S]*?<\/x:cols>/,`<x:cols>${cols}</x:cols>`).replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,`<x:sheetData>${prefix}${body}</x:sheetData><x:autoFilter ref="A${header}:${last}"/>`).replace('</x:sheetPr>',`</x:sheetPr><x:dimension ref="A1:${last}"/>`);
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
  const rows=makeRows(data,result),summaries=[
   `当前方案：共 ${result.total} 人，已安排 ${result.matched} 人，待安排 ${result.unassigned.length} 人；参考 ${result.config.duration} 分钟，平均实际 ${result.averageDuration==null?'—':result.averageDuration.toFixed(2)} 分钟 / 人。`,
   `当前方案：共 ${rows[1].length} 个面试官班次；候选人逐人明细见“候选人面试安排”。`,
   `当前方案：共 ${rows[2].length} 个场务班次；场务按生成时段完整值班。`
  ];
  return workbookBytes(template,rows,summaries,[arrivalColors(rows[0],11)]);
 }
 function queryBytes(data,result){const rows=B.queryRows(result);return workbookBytes(queryTemplate,[rows],[],[arrivalColors(rows,0)]);}
 function workbookBytes(layout,rows,summaries,colors=[]){
  const files={...layout.files},styles=exportStyles(files);
  const strings=[],indices=new Map();let stringCount=0;
  const intern=value=>{stringCount++;if(!indices.has(value)){indices.set(value,strings.length);strings.push(value);}return indices.get(value);};
  layout.sheets.forEach((s,i)=>files[s.path]=worksheet(layout,s,rows[i],summaries[i],intern,styles,colors[i]));
  styles.save();
  files['xl/sharedStrings.xml']=`<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringCount}" uniqueCount="${strings.length}">${strings.map(s=>`<x:si><x:t xml:space="preserve">${esc(s)}</x:t></x:si>`).join('')}</x:sst>`;
  return zip(files);
 }
 root.PlannerExcel={bytes,makeRows,queryBytes};if(typeof module!=='undefined')module.exports=root.PlannerExcel;
})(typeof globalThis!=='undefined'?globalThis:this);
