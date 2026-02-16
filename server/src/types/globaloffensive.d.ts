declare module 'globaloffensive' {
	import { EventEmitter } from 'events'
	import SteamUser from 'steam-user'

	class GlobalOffensive extends EventEmitter {
		constructor(steamUser: SteamUser)

		haveGCSession: boolean
		accountData: any
		inventory: any[]

		requestGame(shareCodeOrDetails: string | object): void
		requestLiveGames(): void
		requestRecentGames(steamId: string | any): void
		requestLiveGameForUser(steamId: string | any): void
		inspectItem(
			owner: string,
			assetid?: string,
			d?: string,
			callback?: (item: any) => void
		): void
		requestPlayersProfile(
			steamId: string | any,
			callback?: (profile: any) => void
		): void

		on(event: 'connectedToGC', listener: () => void): this
		on(
			event: 'disconnectedFromGC',
			listener: (reason: number) => void
		): this
		on(
			event: 'connectionStatus',
			listener: (status: number, data: any) => void
		): this
		on(
			event: 'matchList',
			listener: (matches: any[], data: any) => void
		): this
		on(event: 'debug', listener: (message: string) => void): this
		on(event: string, listener: Function): this

		once(
			event: 'matchList',
			listener: (matches: any[], data?: any) => void
		): this
		once(event: string, listener: Function): this

		removeListener(event: string, listener: Function): this
	}

	namespace GlobalOffensive {
		enum GCConnectionStatus {
			HAVE_SESSION = 0,
			GC_GOING_DOWN = 1,
			NO_SESSION = 2,
			NO_SESSION_IN_LOGON_QUEUE = 3,
			NO_STEAM = 4
		}

		enum ItemCustomizationNotification {
			CasketAdded = 1,
			CasketRemoved = 2,
			CasketInvFull = 3
		}
	}

	export = GlobalOffensive
}
