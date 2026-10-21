# Ponte alle API PDF incluse in Windows. Percorsi e richieste arrivano come dati JSON, mai come codice.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asOperation = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asAction = $methods | Where-Object { $_.Name -eq 'AsTask' -and !$_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Await($operation, [type]$resultType) {
  $task = $asOperation.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
$document = $null
while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    switch ($request.kind) {
      'open' {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($request.path)) ([Windows.Storage.StorageFile])
        $document = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
        if ($document.IsPasswordProtected) { throw 'Il PDF richiede una password.' }
        $sizes = @()
        for ($i = 0; $i -lt $document.PageCount; $i++) {
          $page = $document.GetPage($i)
          try { $sizes += ,@([double]$page.Size.Width, [double]$page.Size.Height) }
          finally { $page.Dispose() }
        }
        $value = @{ sizes = $sizes }
      }
      'render' {
        if ($null -eq $document) { throw 'Documento PDF non aperto.' }
        $page = $document.GetPage([uint32]$request.page)
        $stream = $null
        $reader = $null
        try {
          $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
          $options.DestinationWidth = [uint32]$request.width
          $options.DestinationHeight = [uint32]$request.height
          $options.IsIgnoringHighContrast = $true
          $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
          $task = $asAction.Invoke($null, @($page.RenderToStreamAsync($stream, $options)))
          $null = $task.GetAwaiter().GetResult()
          $reader = New-Object Windows.Storage.Streams.DataReader ($stream.GetInputStreamAt(0))
          $null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
          $data = New-Object byte[] ([int]$stream.Size)
          $reader.ReadBytes($data)
          [IO.File]::WriteAllBytes($request.target, $data)
          $value = $true
        } finally {
          if ($reader) { $reader.Dispose() }
          if ($stream) { $stream.Dispose() }
          $page.Dispose()
        }
      }
      default { throw 'Richiesta PDF sconosciuta.' }
    }
    [Console]::WriteLine((@{ id = $request.id; value = $value } | ConvertTo-Json -Depth 5 -Compress))
  } catch {
    [Console]::WriteLine((@{ id = $request.id; error = $_.Exception.GetBaseException().Message } | ConvertTo-Json -Compress))
  }
}
