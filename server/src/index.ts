import { Server } from './server'

const server = new Server()

process.on('SIGINT', async () => {
	console.log('\nShutting down gracefully...')
	await server.stop()
	process.exit(0)
})

process.on('SIGTERM', async () => {
	console.log('\nShutting down gracefully...')
	await server.stop()
	process.exit(0)
})

server.start().catch((err) => {
	console.error('Failed to start server:', err)
	process.exit(1)
})
