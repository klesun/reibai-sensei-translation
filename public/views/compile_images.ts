import {collectBubblesStorage, collectNotesStorage, parseStreamedJson} from "../modules/DataParse";
import {NoteTransaction, TranslationTransaction} from "../modules/Api";

export default async (
    fetchingBubbles: Promise<Response>,
    fetchingNotes: Promise<Response>
) => {
    const whenBubbleMapping = fetchingBubbles
        .then(rs => parseStreamedJson<TranslationTransaction>(rs))
        .then(txs => collectBubblesStorage(txs));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => collectNotesStorage(txs));

    alert("ololo");
};
