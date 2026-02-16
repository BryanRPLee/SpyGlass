import * as dotenv from 'dotenv'

dotenv.config()

export class Config {
	private static instance: Config

	public readonly port: number
	public readonly steamUsername: string
	public readonly steamPassword: string

	private constructor() {
		this.port = parseInt(process.env.PORT || '3000', 10)
		this.steamUsername = process.env.STEAM_USERNAME || ''
		this.steamPassword = process.env.STEAM_PASSWORD || ''

		this.validate()
	}

	public static getInstance(): Config {
		if (!Config.instance) {
			Config.instance = new Config()
		}
		return Config.instance
	}

	private validate() {
		if (!this.steamUsername || !this.steamPassword) {
			throw new Error(
				'STEAM_USERNAME and STEAM_PASSWORD must be set in environment variables'
			)
		}
	}
}
