import express, { Express } from 'express'
import { SteamClient } from './clients/steamClient'
import { MatchHistoryService } from './services/matchHistoryService'
import { Config } from './config/config'
import { errorHandler } from './middleware/errorHandler'
import { PlayerProfileService } from './services/playerProfileService'

export class Server {
	private app: Express
	private readonly steamClient: SteamClient
	private matchHistoryService: MatchHistoryService
	private playerProfileService: PlayerProfileService
	private config: Config

	constructor() {
		this.app = express()
		this.config = Config.getInstance()
		this.steamClient = new SteamClient(
			this.config.steamUsername,
			this.config.steamPassword
		)
		this.matchHistoryService = new MatchHistoryService(this.steamClient)
		this.playerProfileService = new PlayerProfileService(this.steamClient)

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

		this.app.get('/api/players/:steamId', async (req, res) => {
			try {
				const { steamId } = req.params
				const profile =
					await this.playerProfileService.getPlayerProfile(steamId)

				if (!profile) {
					return res.status(404).json({
						success: false,
						error: 'Player profile not found'
					})
				}

				res.json({ success: true, steamId, profile })
			} catch (err) {
				res.status(500).json({
					success: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		})

		this.app.get('/api/players/:steamId/matches/', async (req, res) => {
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

		this.app.get(
			'/api/players/:steamId/matches/:matchId',
			async (req, res) => {
				try {
					const { steamId, matchId } = req.params
					const matchDetails =
						await this.matchHistoryService.getMatchDetails(
							steamId,
							matchId
						)

					res.json({ success: true, matchId, matchDetails })
				} catch (err) {
					res.status(500).json({
						success: false,
						error:
							err instanceof Error ? err.message : 'Unknown error'
					})
				}
			}
		)
	}

	public async start() {
		try {
			await this.connectWithRetry()
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

	private async connectWithRetry(maxRetries = 3): Promise<void> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				console.log(`Connection attempt ${attempt}/${maxRetries}...`)
				await this.steamClient.connect()
				console.log('Successfully connected to Steam and GC')
				return
			} catch (err: any) {
				console.error(
					`Connection attempt ${attempt} failed:`,
					err.message
				)

				if (err.eresult === 84) {
					console.error(
						'Rate limited by Steam. Please wait at least 30 minutes.'
					)
					console.error(
						'The saved session will be used next time to avoid this.'
					)
					throw err
				}

				if (attempt < maxRetries) {
					const delay = 5000 * attempt
					console.log(`Waiting ${delay / 1000}s before retry...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				} else {
					throw new Error(
						`Failed to connect after ${maxRetries} attempts`
					)
				}
			}
		}
	}

	public async stop() {
		await this.steamClient.disconnect()
	}
}
