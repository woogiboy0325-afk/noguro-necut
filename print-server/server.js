const express = require('express');
const cors    = require('cors');
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const app          = express();
const PORT         = 3001;
const PRINTER_NAME = process.env.PRINTER_NAME || 'Canon SELPHY CP1500';

// 100mm × 177mm → hundredths of an inch
const PAPER_W = 394;
const PAPER_H = 697;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '30mb' }));

// ── 서버 상태 확인 ──────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({ ok: true, printer: PRINTER_NAME });
});

// ── 연결된 프린터 목록 ──────────────────────────────────
app.get('/printers', (req, res) => {
  const ps = 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json';
  execFile('powershell', ['-NoProfile', '-Command', ps], { timeout: 8000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      const list = JSON.parse(stdout.trim());
      res.json({ printers: Array.isArray(list) ? list : [list] });
    } catch {
      res.json({ printers: [] });
    }
  });
});

// ── 인쇄 요청 ──────────────────────────────────────────
app.post('/print', (req, res) => {
  const { imageDataUrl } = req.body;
  if (!imageDataUrl) return res.status(400).json({ error: '이미지 없음' });

  const base64  = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const tmpImg  = path.join(os.tmpdir(), `necut-${Date.now()}.png`);
  const tmpPs   = path.join(os.tmpdir(), `necut-${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpImg, Buffer.from(base64, 'base64'));
  } catch (e) {
    return res.status(500).json({ error: `임시 파일 저장 실패: ${e.message}` });
  }

  // System.Drawing으로 대화상자 없이 직접 인쇄
  const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${tmpImg.replace(/\\/g, '\\\\')}')
$pd  = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${PRINTER_NAME.replace(/'/g, "''")}'
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Custom', ${PAPER_W}, ${PAPER_H})
$pd.DefaultPageSettings.Margins   = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$captured = $img
$pd.add_PrintPage({
  param($s, $e)
  $e.Graphics.DrawImage($captured, $e.PageBounds)
})
$pd.Print()
$pd.Dispose()
$img.Dispose()
`;

  fs.writeFileSync(tmpPs, psScript, 'utf8');

  execFile(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
    { timeout: 20000 },
    (err, stdout, stderr) => {
      cleanup(tmpImg, tmpPs);
      if (err) {
        console.error('[인쇄 오류]', stderr || err.message);
        return res.status(500).json({ error: stderr?.trim() || err.message });
      }
      console.log(`[인쇄 완료] ${new Date().toLocaleTimeString('ko-KR')}`);
      res.json({ ok: true });
    }
  );
});

function cleanup(...files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
  }
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🖨️  놀구로 네컷 인쇄 서버`);
  console.log(`   주소:    http://localhost:${PORT}`);
  console.log(`   프린터:  ${PRINTER_NAME}`);
  console.log(`   용지:    100mm × 177mm\n`);
});
