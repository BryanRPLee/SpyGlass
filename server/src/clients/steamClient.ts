import { EventEmitter } from 'events'
import SteamUser from 'steam-user'
import GlobalOffensive from 'globaloffensive'
import path from 'path'
import fs from 'fs'

export class SteamClient extends EventEmitter {
	private readonly user: SteamUser
	private readonly csgo: GlobalOffensive
	private readonly username: string
	private readonly password: string
	private connected = false
	private gcConnected = false
	private readonly sessionsPath: string

	constructor(username: string, password: string) {
		super()
		this.username = username
		this.password = password
		this.user = new SteamUser()
		this.csgo = new GlobalOffensive(this.user)

		this.sessionsPath = path.join(__dirname, '../../.sessions')
		if (!fs.existsSync(this.sessionsPath)) {
			fs.mkdirSync(this.sessionsPath, { recursive: true })
		}

		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.user.on('loggedOn', () => {
			console.log('Logged into Steam')
			this.connected = true
			this.user.setPersona(SteamUser.EPersonaState.Online)
			this.user.gamesPlayed([730])
		})

		this.user.on('loginKey', (key) => {
			console.log('Received login key, saving for future logins...')
			const sessionFile = path.join(
				this.sessionsPath,
				`${this.username}.json`
			)
			fs.writeFileSync(sessionFile, JSON.stringify({ loginKey: key }))
		})

		this.user.on('refreshToken', (refreshToken) => {
			console.log('Received refresh token, saving for future logins...')
			const sessionFile = path.join(
				this.sessionsPath,
				`${this.username}.json`
			)
			const existingData = fs.existsSync(sessionFile)
				? JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
				: {}

			fs.writeFileSync(
				sessionFile,
				JSON.stringify({ ...existingData, refreshToken })
			)
		})

		this.user.on('error', (err) => {
			console.error('Steam error:', err)

			if (err.eresult === SteamUser.EResult.RateLimitExceeded) {
				console.error('RATE LIMITED: Please wait 30-60 minutes')
				console.error(
					'💡 Use saved sessions to avoid this in the future'
				)
			}

			this.emit('error', err)
		})

		this.csgo.on('connectedToGC', () => {
			console.log('Connected to CS:GO Game Coordinator')
			this.gcConnected = true
			this.emit('gcConnected')
		})

		this.csgo.on('disconnectedFromGC', (reason) => {
			console.log('Disconnected from CS:GO Game Coordinator', reason)
			this.gcConnected = false
			this.emit('gcDisconnected', reason)
		})

		this.csgo.on('debug', (msg) => {
			console.log('GC Debug:', msg)
		})
	}

	public async connect() {
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Connection timeout')),
				60000
			)

			this.once('gcConnected', () => {
				clearTimeout(timeout)
				resolve()
			})

			this.once('error', (err) => {
				clearTimeout(timeout)
				reject(err)
			})

			const sessionFile = path.join(
				this.sessionsPath,
				`${this.username}.json`
			)
			let loginOptions: any = {
				accountName: this.username,
				rememberPassword: true
			}

			if (fs.existsSync(sessionFile)) {
				try {
					const savedSession = JSON.parse(
						fs.readFileSync(sessionFile, 'utf-8')
					)

					if (savedSession.refreshToken) {
						console.log(
							'Using saved refresh token (no Steam Guard needed)'
						)
						loginOptions.refreshToken = savedSession.refreshToken
						delete loginOptions.accountName
					} else if (savedSession.loginKey) {
						console.log(
							'Using saved login key (no Steam Guard needed)'
						)
						loginOptions.loginKey = savedSession.loginKey
					} else {
						console.log('Fresh login required')
						loginOptions.password = this.password
					}
				} catch (err) {
					console.error('Failed to load session, doing fresh login')
					loginOptions.password = this.password
				}
			} else {
				console.log('First time login - Steam Guard required')
				loginOptions.password = this.password
			}

			console.log('Logging into Steam...')
			this.user.logOn(loginOptions)
		})
	}

	public async disconnect() {
		this.user.logOff()
		this.connected = false
		this.gcConnected = false
	}

	public isConnected(): boolean {
		return this.connected && this.gcConnected
	}

	public getCSGOClient(): GlobalOffensive {
		return this.csgo
	}

	public hasGCSession(): boolean {
		return this.csgo.haveGCSession
	}
}
