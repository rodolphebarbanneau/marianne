/**
 * Runs short commands for the main process, in a process of its own (see main/aside.ts): one
 * message in, the command's result or its error back.
 */
import { run } from './util'

interface Call {
  id: number
  cmd: string
  args: string[]
  opts: Parameters<typeof run>[2]
}

process.parentPort.on('message', ({ data }) => {
  const { id, cmd, args, opts } = data as Call
  run(cmd, args, opts).then(
    (result) => process.parentPort.postMessage({ id, result }),
    (err: Error) => process.parentPort.postMessage({ id, error: err.message })
  )
})
