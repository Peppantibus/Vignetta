import { open, type FileHandle } from 'node:fs/promises'

/** Legge `length` byte da `position` (meno, se il file finisce prima). */
export async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
}

/** I primi `bytes` byte di un file: bastano per riconoscerne il formato o le dimensioni di un'immagine. */
export async function readFileHead(path: string, bytes: number): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    return await readAt(file, 0, bytes)
  } finally {
    await file.close()
  }
}
