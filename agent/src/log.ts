function ts(): string {
  return new Date().toTimeString().slice(0, 8)
}

export const log = {
  info(msg: string): void {
    console.log(`[${ts()}][INFO] ${msg}`)
  },
  error(msg: string): void {
    console.error(`[${ts()}][ERROR] ${msg}`)
  },
}
