# Rode na pasta do projeto (onde está AgroScan.csproj):  powershell -ExecutionPolicy Bypass -File aplicar-patches.ps1
$utf8 = New-Object System.Text.UTF8Encoding $true
function Edit($path, [scriptblock]$fn) {
  if (-not (Test-Path $path)) { Write-Host "nao achei $path"; return }
  $t = [IO.File]::ReadAllText($path); $n = & $fn $t
  if ($n -ne $t) { [IO.File]::WriteAllText($path, $n, $utf8); Write-Host "ok  $path" }
}
# 1) siglas de categoria expandidas pelo servidor
Edit "Services\PromptService.cs" { param($t)
  if ($t -match '"fo",') { return $t }
  $t -replace '(\{ "IN",\s*"Inconclusivo" \},)', ('$1' + "`r`n            { `"fo`", `"folhosa`" }, { `"fr`", `"fruto`" }, { `"ra`", `"raiz`" }, { `"bu`", `"bulbo`" }, { `"le`", `"legume`" }, { `"tu`", `"tubérculo`" }, { `"br`", `"brassica`" },") }
# 2) risco "alta/media/baixa" nos relatórios (PDF / WhatsApp)
foreach ($f in "Controllers\RelatorioController.cs","Services\PdfService.cs") {
  Edit $f { param($t)
    $t -replace '"alto" =>','"alto" or "alta" =>' -replace '"medio" =>','"medio" or "media" =>' -replace '"baixo" =>','"baixo" or "baixa" =>' } }
# 3) opção Tubérculo no filtro
Edit "wwwroot\hortalicas.html" { param($t)
  if ($t -match 'value="tub') { return $t }
  $t.Replace('<option value="brassica">Brássica</option>','<option value="brassica">Brássica</option><option value="tubérculo">Tubérculo</option>') }
# 4) remove emojis dos demais html/js
$rx = '[\uD83C-\uD83E][\uDC00-\uDFFF]\uFE0F?[ ]?|[\u2600-\u27BF]\uFE0F?[ ]?'
Get-ChildItem wwwroot -Recurse -Include *.html,*.js | ForEach-Object {
  Edit $_.FullName { param($t) [regex]::Replace($t, $rx, '') } }
Write-Host "Pronto."
