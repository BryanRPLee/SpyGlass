export interface Reservation {
	account_ids: number[]
	rankings: number[]
	party_ids: number[]
	whitelist: any[]
	tournament_teams: any[]
	tournament_casters_account_ids: number[]
	op_var_values: any[]
	game_type: number | null
	match_id: string | null
	server_version: number | null
	encryption_key: string | null
	encryption_key_pub: string | null
	tv_master_steamid: string | null
	tournament_event: number | null
	tv_relay_steamid: string | null
	pre_match_data: any | null
	rtime32_event_start: number | null
	tv_control: any | null
	flags: number | null
	socache_control: any | null
}

export interface RoundStats {
	kills: number[]
	assists: number[]
	deaths: number[]
	scores: number[]
	pings: number[]
	team_scores: [number, number]
	enemy_kills: number[]
	enemy_headshots: number[]
	enemy_3ks: number[]
	enemy_4ks: number[]
	enemy_5ks: number[]
	mvps: number[]
	enemy_kills_agg: number[]
	enemy_2ks: number[]
	player_spawned: number[]
	team_spawn_count: number[]
	reservationid: string | null
	reservation: Reservation
	map: string | null
	round: number | null
	round_result: number | null
	match_result: number | null
	confirm: number | null
	reservation_stage: number | null
	match_duration: number
	spectators_count: number | null
	spectators_count_tv: number | null
	spectators_count_lnk: number | null
	drop_info: any | null
	b_switched_teams: boolean | null
	max_rounds: number | null
}

export interface WatchableMatchInfo {
	server_ip: number
	tv_port: number
	tv_spectators: number
	tv_time: number | null
	tv_watch_password: string | null
	cl_decryptdata_key: string | null
	cl_decryptdata_key_pub: string | null
	game_type: number | null
	game_mapgroup: string | null
	game_map: string | null
	server_id: string | null
	match_id: string | null
	reservation_id: string | null
}

export interface Match {
	matchid: string
	matchtime: number
	watchablematchinfo?: WatchableMatchInfo
	roundstatsall?: RoundStats[]
	roundstats_legacy?: any | null
}
