"""Build a self-contained HTML planner. Python 3 standard library only.
Usage: python3 build.py --public [output.html]
       python3 build.py candidates.xlsx staff.xlsx [private-output.html] [year]
"""
from pathlib import Path
import json, sys, zipfile, re, datetime, xml.etree.ElementTree as ET

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            shared=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
        book=ET.fromstring(z.read('xl/workbook.xml'))
        sheet=book.find('s:sheets/s:sheet',NS)
        rid=sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        rel=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target=next(r.attrib['Target'] for r in rel if r.attrib['Id']==rid)
        target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        rows=[]
        for row in ET.fromstring(z.read(target)).findall('s:sheetData/s:row',NS):
            out=[]
            for c in row.findall('s:c',NS):
                col=0
                for ch in c.attrib['r']:
                    if ch.isalpha():col=col*26+ord(ch.upper())-64
                    else:break
                while len(out)<col:out.append('')
                t=c.attrib.get('t');v=c.find('s:v',NS)
                value='' if v is None else (v.text or '')
                if t=='s':value=shared[int(value)]
                if t=='inlineStr':value=''.join(n.text or '' for n in c.findall('.//s:t',NS))
                out[col-1]=value
            rows.append(out)
        return rows

def build(a,b,out,year=None):
    here=Path(__file__).parent
    inferred=re.search(r'(?:^|\D)(20\d{2})(?:\D|$)',Path(a).name)
    year=int(year or (inferred.group(1) if inferred else datetime.date.today().year))
    raw={'candidates':read_xlsx(a),'staff':read_xlsx(b),'sources':[Path(a).name,Path(b).name],'year':year}
    write_html(raw,out)

def write_html(raw,out):
    here=Path(__file__).parent
    template=(here/'template.html').read_text()
    text=template.replace('/*__ENGINE__*/',(here/'scheduler.js').read_text()).replace('/*__ROSTER__*/',(here/'records.js').read_text()).replace('/*__EXCEL__*/',(here/'excel-template.js').read_text()+'\n'+(here/'excel-export.js').read_text()).replace('/*__APP__*/',(here/'app.js').read_text()).replace('__DATA__',json.dumps(raw,ensure_ascii=False).replace('<','\\u003c')).replace('__DEMO__',(here/'demo.json').read_text().replace('<','\\u003c'))
    Path(out).parent.mkdir(parents=True,exist_ok=True);Path(out).write_text(text)
    print(json.dumps({'output':str(Path(out).resolve()),'candidates':len(raw['candidates'])-1,'staff':len(raw['staff'])-1},ensure_ascii=False))
if __name__=='__main__':
    if len(sys.argv)==1 or sys.argv[1]=='--public':
        write_html({'candidates':[['学号','姓名','面试时间','线上面试']],'staff':[['姓名','部门','面试官时间','场务时间','工作人员编号']],'sources':[],'year':datetime.date.today().year},sys.argv[2] if len(sys.argv)>2 else 'dist/index.html')
        raise SystemExit(0)
    if len(sys.argv)<3:raise SystemExit(__doc__)
    build(sys.argv[1],sys.argv[2],sys.argv[3] if len(sys.argv)>3 else '上马面试排班.html',sys.argv[4] if len(sys.argv)>4 else None)
