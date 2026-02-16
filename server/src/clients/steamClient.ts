import { EventEmitter } from 'events'
import SteamUser from 'steam-user'
import GlobalOffensive from 'globaloffensive'

export class SteamClient extends EventEmitter {
	private readonly user: SteamUser
	private readonly csgo: GlobalOffensive
	private readonly username: string
	private readonly password: string
	private connected = false
	private gcConnected = false

	constructor(username: string, password: string) {
		super()
		this.username = username
		this.password = password
		this.user = new SteamUser()
		this.csgo = new GlobalOffensive(this.user)

		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.user.on('loggedOn', () => {
			console.log('Logged into Steam')
			this.connected = true
			this.user.setPersona(SteamUser.EPersonaState.Online)
			this.user.gamesPlayed([730])
		})

		this.user.on('error', (err) => {
			console.error('Steam error:', err)
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

	public async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject('Timeout'), 30000)

			this.once('gcConnected', () => {
				clearTimeout(timeout)
				resolve()
			})

			this.user.logOn({
				accountName: this.username,
				password: this.password
			})
		})
	}

	public async disconnect(): Promise<void> {
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
