/* barcode-encoder-start — FREAK count: a barcode drawn as SVG, for the register's scanner (v3.1 on the task card, v3.2 also on
   the printable task sheet). EAN-13 / UPC-A / EAN-8 by their check digit (the symbology the scanner reports for the label),
   everything else as Code 128 (subset C for an even run of digits, else B). tools/test/barcode_test.py proves the drawing:
   the EAN bits equal the test writer's, and the app's own scanner + zxing-cpp decode every drawing. */
const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const C128=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232'];
const C128_STOP='2331112';
const bcEsc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function bcGtinValid(s){             // EAN-8 / UPC-A / EAN-13 check digit
  if(!/^\d{8}$|^\d{12}$|^\d{13}$/.test(s)) return false;
  const d = s.split('').map(Number).reverse();
  let sum = 0;
  for(let i=1;i<d.length;i++) sum += d[i] * (i%2===1 ? 3 : 1);
  return d[0] === (10 - (sum % 10)) % 10;
}
function eanBits(digits){           // 13 digits (a UPC-A gets its leading 0 first) or 8 digits — the check digit already verified
  const d=digits.split('').map(Number);
  if(d.length===13){ let bits='101'; const par=EAN_PARITY[d[0]]; for(let i=0;i<6;i++) bits+=(par[i]==='L'?EAN_L:EAN_G)[d[1+i]]; bits+='01010'; for(let i=0;i<6;i++) bits+=EAN_R[d[7+i]]; return bits+'101'; }
  if(d.length===8){ let bits='101'; for(let i=0;i<4;i++) bits+=EAN_L[d[i]]; bits+='01010'; for(let i=4;i<8;i++) bits+=EAN_R[d[i]]; return bits+'101'; }
  return null;
}
function code128Bits(text){        // subset C for an even run of digits, else subset B (printable ASCII); a Hebrew barcode cannot be drawn
  if(!/^[\x20-\x7e]{1,40}$/.test(text)) return null;
  const pairs=/^\d+$/.test(text) && text.length%2===0;
  const vals=[]; const start=pairs?105:104;
  if(pairs){ for(let i=0;i<text.length;i+=2) vals.push(Number(text.slice(i,i+2))); }
  else { for(const ch of text) vals.push(ch.charCodeAt(0)-32); }
  let sum=start; vals.forEach((v,i)=>{ sum+=v*(i+1); });
  let bits='';
  for(const v of [start,...vals,sum%103]){ const w=C128[v]; for(let i=0;i<w.length;i++) bits+=(i%2===0?'1':'0').repeat(Number(w[i])); }
  for(let i=0;i<C128_STOP.length;i++) bits+=(i%2===0?'1':'0').repeat(Number(C128_STOP[i]));
  return bits;
}
function barcodeBits(text){
  const t=String(text||'').trim();
  if(!t) return null;
  if(/^\d{12}$/.test(t) && bcGtinValid(t)) return {bits:eanBits('0'+t), kind:'UPC-A'};
  if(/^\d{13}$/.test(t) && bcGtinValid(t)) return {bits:eanBits(t), kind:'EAN-13'};
  if(/^\d{8}$/.test(t) && bcGtinValid(t)) return {bits:eanBits(t), kind:'EAN-8'};
  const b=code128Bits(t); return b ? {bits:b, kind:'Code 128'} : null;
}
/** bars as rects on a transparent background (the box behind it is white), 10 modules of quiet zone each side.
 *  opts.mm: a physical width — the print sheet gives an EAN its 38 mm (100 % magnification is 37.3 mm) and a Code 128 0.33 mm per module */
function barcodeSvg(text, opts){
  const bc=barcodeBits(text); if(!bc) return '';
  const quiet=10, n=bc.bits.length, w=n+2*quiet, h=60;
  let rects='', run=0, at=0;
  for(let i=0;i<=n;i++){ const on=i<n && bc.bits[i]==='1'; if(on){ if(!run) at=i; run++; } else if(run){ rects+='<rect x="'+(quiet+at)+'" y="0" width="'+run+'" height="'+h+'"/>'; run=0; } }
  const size = opts && opts.mm ? ' width="'+(bc.kind==='Code 128' ? Math.min(70, Math.max(30, Math.round(w*0.33*10)/10)) : 38)+'mm" height="'+(opts.hmm||12)+'mm"' : ' width="'+(w*2)+'" height="'+h+'"';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'"'+size+' preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000" aria-label="'+bcEsc(text)+'">'+rects+'</svg>';
}
if(typeof window!=='undefined') window.FreakBarcode = { bits: barcodeBits, svg: barcodeSvg };
/* barcode-encoder-end */
