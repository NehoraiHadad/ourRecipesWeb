//#region src/tokens.ts
/** True for the code points that sherpa-onnx treats as CJK (`IsCJK` in text-utils.cc). */
function isCjk(code) {
	return code >= 4352 && code <= 4607 || code >= 11904 && code <= 42191 || code >= 43072 && code <= 55215 || code >= 63744 && code <= 64255 || code >= 65072 && code <= 65103 || code >= 65381 && code <= 65500 || code >= 131072 && code <= 196607;
}
/** True for the code points that sherpa-onnx treats as punctuation (`IsPunct` in text-utils.cc). */
function isPunctuation(code) {
	return code >= 33 && code <= 47 || code >= 58 && code <= 64 || code >= 91 && code <= 96 || code >= 123 && code <= 126 || code >= 12288 && code <= 12351 || code >= 65281 && code <= 65295 || code >= 65306 && code <= 65312 || code >= 65339 && code <= 65344 || code >= 65371 && code <= 65381;
}
/** True when a token holds only punctuation and spaces, by the rule that `joinTokens` uses. */
function isPunctuationToken(token) {
	const chars = [...token.trim()];
	return chars.length > 0 && chars.every((char) => isPunctuation(char.codePointAt(0)));
}
/** A byte that sherpa-onnx writes as `<0xNN>`, for models with BPE byte fallback. */
const byteToken = /^<0x([0-9A-F]{2})>$/;
/**
* The text of transducer tokens, built as sherpa-onnx builds its result text. The function
* concatenates the tokens, with `<0xNN>` tokens as raw bytes, and removes each space between two
* CJK characters or before punctuation. It also trims the result.
*
* sherpa-onnx decodes the text of a byte-level BPE model with one more table. This function does not
* use that table. It gives wrong text for such a model. For a CTC model, sherpa-onnx keeps the
* spaces between CJK characters. The two texts can then differ in spaces.
*/
function joinTokens(tokens) {
	const encoder = new TextEncoder();
	const bytes = [];
	for (const token of tokens) {
		const byte = byteToken.exec(token);
		if (byte) bytes.push(Number.parseInt(byte[1], 16));
		else bytes.push(...encoder.encode(token));
	}
	const chars = [...new TextDecoder().decode(new Uint8Array(bytes))];
	return chars.filter((char, i) => {
		if (char !== " " || i === 0 || i === chars.length - 1) return true;
		const previous = chars[i - 1].codePointAt(0);
		const next = chars[i + 1].codePointAt(0);
		return !(isCjk(previous) && isCjk(next) || isPunctuation(next));
	}).join("").trim();
}
/** The index of the last item whose key is at or before `value`, or -1. The keys must not decrease. */
function lastAtOrBefore(count, key, value) {
	let low = 0;
	let high = count;
	while (low < high) {
		const middle = low + high >> 1;
		if (key(middle) <= value) low = middle + 1;
		else high = middle;
	}
	return low - 1;
}
/**
* Maps the recognizer's time back to session positions, so that each token goes to the row whose
* audio produced it. Use it when the recognizer hears only parts of a session, for example the
* speech of a conversation. A row can be a speaker turn. Positions and lengths count samples.
*
* A token comes after its speech. The timeline moves each token's time back by `lagSeconds`. The
* value 0.2 s fits X-ASR. Measure the delay for another model. A token in the silence after a span
* belongs to that span. A pause therefore keeps a late token in its row. Inside a span, a token
* that comes more than `lagSeconds` after its speech can go to the next row. Each token goes to a
* row by its own time. A cut inside a word of several tokens therefore splits the word between two
* rows.
*/
function createTokenTimeline(sampleRate, lagSeconds) {
	const lag = Math.round(lagSeconds * sampleRate);
	let spans = [];
	/** The session position of a token's audio, or undefined for audio before this session. */
	function positionOf(token) {
		const time = Math.round(token.time * sampleRate);
		const span = spans[lastAtOrBefore(spans.length, (i) => spans[i].from, time - lag)];
		if (span) return span.at + Math.min(time - lag - span.from, span.to - span.from - 1);
		return spans[0] && time >= spans[0].from ? spans[0].at : void 0;
	}
	return {
		hear(at, from, length) {
			const last = spans.at(-1);
			if (last && last.to === from && last.at + last.to - last.from === at) last.to += length;
			else spans.push({
				from,
				to: from + length,
				at
			});
		},
		reset() {
			spans = [];
		},
		place(tokens, rowStarts, liveFrom) {
			const rows = rowStarts.map(() => []);
			const live = [];
			const start = rowStarts[0] ?? liveFrom;
			if (start === void 0) return {
				rows: [],
				live: ""
			};
			const first = lastAtOrBefore(tokens.length, (i) => positionOf(tokens[i]) ?? Number.NEGATIVE_INFINITY, start - 1) + 1;
			let target;
			for (const token of tokens.slice(first)) {
				if (!isPunctuationToken(token.text)) {
					const position = positionOf(token);
					target = liveFrom !== void 0 && position >= liveFrom ? live : rows[lastAtOrBefore(rowStarts.length, (i) => rowStarts[i], position)];
				}
				target?.push(token.text);
			}
			return {
				rows: rows.map((words) => joinTokens(words)),
				live: joinTokens(live)
			};
		}
	};
}

//#endregion
export { isPunctuationToken as n, joinTokens as r, createTokenTimeline as t };