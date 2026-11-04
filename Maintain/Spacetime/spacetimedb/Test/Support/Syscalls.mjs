// The host injects `spacetime:sys@2.x` as virtual modules; node cannot resolve
// them. Every member here is a recording no-op, because the module under test
// reaches the datastore through the test harness's own backend rather than
// through syscalls - the stub exists so the harness and the module load at all.
const calls = [];

function record(name) {
	return (...args) => {
		calls.push({ name, args });
		return undefined;
	};
}

/** Every syscall the module or the harness attempted, for a test that cares. */
export const syscalls = calls;

export const console_log = record("console_log");
export const console_timer_start = record("console_timer_start");
export const console_timer_end = record("console_timer_end");

export const identity = () => 0n;
export const get_jwt_payload = () => new Uint8Array();
export const table_id_from_name = record("table_id_from_name");
export const index_id_from_name = record("index_id_from_name");

export const datastore_clear = record("datastore_clear");
export const datastore_delete_all_by_eq_bsatn = record("datastore_delete_all_by_eq_bsatn");
export const datastore_delete_by_index_scan_point_bsatn = record(
	"datastore_delete_by_index_scan_point_bsatn",
);
export const datastore_delete_by_index_scan_range_bsatn = record(
	"datastore_delete_by_index_scan_range_bsatn",
);
export const datastore_index_scan_point_bsatn = record("datastore_index_scan_point_bsatn");
export const datastore_index_scan_range_bsatn = record("datastore_index_scan_range_bsatn");
export const datastore_insert_bsatn = record("datastore_insert_bsatn");
export const datastore_table_row_count = record("datastore_table_row_count");
export const datastore_table_scan_bsatn = record("datastore_table_scan_bsatn");
export const datastore_update_bsatn = record("datastore_update_bsatn");
export const row_iter_bsatn_advance = record("row_iter_bsatn_advance");
export const row_iter_bsatn_close = record("row_iter_bsatn_close");

export const procedure_abort_mut_tx = record("procedure_abort_mut_tx");
export const procedure_commit_mut_tx = record("procedure_commit_mut_tx");
export const procedure_http_request = record("procedure_http_request");
export const procedure_start_mut_tx = record("procedure_start_mut_tx");

export const moduleHooks = {
	register: record("register"),
	unregister: record("unregister"),
};
export const env_get = () => undefined;
