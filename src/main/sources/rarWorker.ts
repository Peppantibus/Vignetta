import { parentPort, workerData } from 'node:worker_threads'
import { createExtractorFromFile } from 'node-unrar-js'
import { cacheFileName, type RarJob, type RarMessage } from './rarJob'

const job = workerData as RarJob
const post = (message: RarMessage): void => parentPort?.postMessage(message)

async function run(): Promise<void> {
  if (job.kind === 'list') {
    const extractor = await createExtractorFromFile({ filepath: job.archive })
    const names: string[] = []
    for (const header of extractor.getFileList().fileHeaders) {
      if (!header.flags.directory) names.push(header.name)
    }
    post({ type: 'list', names })
    return
  }

  const extractor = await createExtractorFromFile({
    filepath: job.archive,
    targetPath: job.targetDir,
    filenameTransform: cacheFileName
  })
  const wanted = new Set(job.files)
  let remaining = wanted.size
  for (const file of extractor.extract({ files: (header) => wanted.has(header.name) }).files) {
    post({ type: 'file', name: file.fileHeader.name })
    if (--remaining === 0) break
  }
}

run().then(
  () => post({ type: 'done' }),
  (error: unknown) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
)
