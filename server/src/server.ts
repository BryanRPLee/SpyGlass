import express, { Express } from 'express'
import { SteamClient } from './clients/steamClient'
import { MatchHistoryService } from './services/matchHistoryService'
import { Config } from './config/config'
import { errorHandler } from './middleware/errorHandler'

export class Server {
	private app: Express
	private readonly steamClient: SteamClient
	private matchHistoryService: MatchHistoryService
	private config: Config

	constructor() {
		this.app = express()
		this.config = Config.getInstance()
		this.steamClient = new SteamClient(
			this.config.steamUsername,
			this.config.steamPassword
		)
		this.matchHistoryService = new MatchHistoryService(this.steamClient)

		this.setupMiddleware()
		this.setupRoutes()
	}

	private setupMiddleware() {
		this.app.use(express.json())
		this.app.use(errorHandler)
	}

	private setupRoutes() {
		this.app.get('/health', (_, res) => {
			res.json({
				status: 'ok',
				connected: this.steamClient.isConnected()
			})
		})

		this.app.get('/matches/:steamId', async (req, res) => {
			try {
				const { steamId } = req.params
				const matches =
					await this.matchHistoryService.getPlayerMatchHistory(
						steamId
					)
				res.json({ success: true, steamId, matches })
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})
	}

	public async start() {
		try {
			await this.steamClient.connect()
			this.app.listen(this.config.port, () => {
				console.log(`Server listening on port ${this.config.port}`)
				console.log(
					`Connected to Steam as: ${this.config.steamUsername}`
				)
			})
		} catch (err) {
			console.error('Failed to start server:', err)
			process.exit(1)
		}
	}

	public async stop() {
		await this.steamClient.disconnect()
	}
}
