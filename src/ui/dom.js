/** getElementById that fails fast with a clear message when the markup and code drift apart. */
export function byId( id ) {

	const el = document.getElementById( id );
	if ( ! el ) throw new Error( `Missing #${ id } in index.html` );
	return el;

}

export function escapeHtml( s ) {

	return String( s ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ c ] ) );

}

/** Plain text of an HTML snippet, for third-party markup we display but don't trust. */
export function htmlToText( html ) {

	return new DOMParser().parseFromString( html, 'text/html' ).body.textContent.trim();

}
