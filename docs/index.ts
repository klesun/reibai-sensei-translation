
import Api, {API_ENDPOINT, createUuid} from "./modules/Api";
import OcrDataAdapter from "./modules/OcrDataAdapter.js";
import type {LocalBackup, UnrecognizedTranslationTransaction} from "./modules/Api";
import type {NoteTransaction, PageTransactionBase} from "./modules/Api";
import type {TranslationTransaction} from "./modules/Api";
import {getApiToken} from "./modules/Api";
import {
    collectBubblesStorage,
    collectNotesStorage, collectUnrecognizedBubblesStorage, getPageName,
    parseStreamedJson,
} from "./modules/DataParse";
import {printMoney} from "./modules/ProfitCalculation";
import CreatePageTranslationView from "./modules/CreatePageTranslationView";
import ActionsQueue from "./modules/ActionsQueue";
import CompileImage from "./modules/CompileImage";

const gui = {
    annotations_svg_root: document.getElementById('annotations_svg_root')! as unknown as SVGElement,
    node_json_holder: document.getElementById('node_json_holder')!,
    selected_block_text_holder: document.getElementById('selected_block_text_holder')!,
    translation_blocks_rows_list: document.getElementById('translation_blocks_rows_list')!,
    current_page_img: document.getElementById('current_page_img')! as HTMLImageElement,
    page_input: document.getElementById('page_input') as HTMLInputElement,
    volume_input: document.getElementById('volume_input') as HTMLInputElement,
    page_select_form: document.getElementById('page_select_form')!,
    bubbles_translations_input_form: document.getElementById('bubbles_translations_input_form') as HTMLFormElement,
    go_to_next_page_button: document.getElementById('go_to_next_page_button')!,
    status_message_holder: document.getElementById('status_message_holder')!,
    translator_notes_input: document.getElementById('translator_notes_input') as HTMLTextAreaElement,
    words_translated_counter: document.getElementById('words_translated_counter')!,
    money_earned_counter: document.getElementById('money_earned_counter')!,
    add_bubble_btn: document.getElementById('add_bubble_btn')!,
    output_png_canvas: document.getElementById("output_png_canvas") as HTMLCanvasElement,
    white_blur_img: document.getElementById("white_blur_img") as HTMLImageElement,
};

type GoogleSentenceTranslation = {
    jpn_ocr: string,
    eng_google: string,
};

const BUBBLE_TRANSLATION = 'BUBBLE_TRANSLATION';
const UNRECOGNIZED_BUBBLE_TRANSLATION = 'UNRECOGNIZED_BUBBLE_TRANSLATION';
const NOTE_TRANSLATION = 'NOTE_TRANSLATION';
const APP_DEVICE_UID = 'APP_DEVICE_UID';

const makeBubbleKey = (tx: TranslationTransaction) => {
    return BUBBLE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeNumber, tx.pageIndex, tx.ocrBubbleIndex,
    ]);
};

const makeUnrecognizedBubbleKey = (tx: UnrecognizedTranslationTransaction) => {
    return UNRECOGNIZED_BUBBLE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeNumber, tx.pageIndex, tx.uuid,
    ]);
};

const makeNoteKey = (tx: NoteTransaction) => {
    return NOTE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeNumber, tx.pageIndex,
    ]);
};

const getLocalBackupTransactions = (): LocalBackup => {
    let deviceUid = localStorage.getItem(APP_DEVICE_UID);
    if (!deviceUid) {
        deviceUid = createUuid();
        localStorage.setItem(APP_DEVICE_UID, deviceUid);
    }
    const localBackup: LocalBackup = {
        deviceUid: deviceUid,
        BUBBLE_TRANSLATION: [],
        UNRECOGNIZED_BUBBLE_TRANSLATION: [],
        NOTE_TRANSLATION: [],
    };
    for (let i = 0; i < window.localStorage.length; ++i) {
        const key = window.localStorage.key(i);
        if (key!.startsWith(BUBBLE_TRANSLATION + '_')) {
            const tx = JSON.parse(window.localStorage.getItem(key!)!);
            localBackup.BUBBLE_TRANSLATION.push(tx);
        } else if (key!.startsWith(NOTE_TRANSLATION + '_')) {
            const tx = JSON.parse(window.localStorage.getItem(key!)!);
            localBackup.NOTE_TRANSLATION.push(tx);
        } else if (key!.startsWith(UNRECOGNIZED_BUBBLE_TRANSLATION + '_')) {
            const tx = JSON.parse(window.localStorage.getItem(key!)!);
            localBackup.UNRECOGNIZED_BUBBLE_TRANSLATION.push(tx);
        }
    }
    return localBackup;
};

const addLocalBackupTransactions = <
    TTransaction extends
        | TranslationTransaction
        | UnrecognizedTranslationTransaction
        | NoteTransaction
>(transactions: TTransaction[], localTransactions: TTransaction[]) => {
    transactions.push(...localTransactions);
    transactions.sort((a,b) => {
        return new Date(a.sentAt).getTime()
            - new Date(b.sentAt).getTime();
    });
};

const toHandleUpdateResponse = (localKey: string) => {
    return [
        (rsData: Response) => {
            const msg = 'Submitted your ' + localKey + ' update to server: ' + rsData.status;
            document.body.setAttribute('data-status', 'SUCCESS');
            gui.status_message_holder.textContent = msg;
        },
        (error: Error | unknown) => {
            const msg = 'Could not submit your ' + localKey + ' update' +
                ' to server. Your change was stored offline for now... REASON: ' + String(error).slice(0, 60);
            document.body.setAttribute('data-status', 'ERROR');
            gui.status_message_holder.textContent = msg;
        },
    ] as const;
};

const initialStateResponseHandlers = [
    () => {
        document.body.setAttribute('data-status', 'READY');
        gui.status_message_holder.textContent = 'Ready for input';
    },
    (error: Error | unknown) => {
        document.body.setAttribute('data-status', 'INITIALIZATION_ERROR');
        gui.status_message_holder.textContent = 'Failed to restore the last progress - ' + error;
    },
] as const;

const prepareBubbleMapping = (transactions: TranslationTransaction[], localTransactions: TranslationTransaction[], api: Api) => {
    addLocalBackupTransactions(transactions, getLocalBackupTransactions().BUBBLE_TRANSLATION);
    const { matrix, set, get } = collectBubblesStorage(transactions);
    return {
        matrix: matrix,
        get: get,
        set: (tx: TranslationTransaction) => {
            set(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeBubbleKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            // TODO: make a queue of actions to preserve order and for store failed actions and retry them once 30 seconds or smth
            api.submitBubbleUpdate({ transactions: [tx] })
                .then(...toHandleUpdateResponse(localKey));
        },
    };
};

const prepareUnrecognizedBubbleMapping = (transactions: UnrecognizedTranslationTransaction[], localTransactions: UnrecognizedTranslationTransaction[], api: Api) => {
    addLocalBackupTransactions(transactions, getLocalBackupTransactions().UNRECOGNIZED_BUBBLE_TRANSLATION);
    const { matrix, set, get, getAllAtPage } = collectUnrecognizedBubblesStorage(transactions);
    return {
        matrix: matrix,
        get: get,
        getAllAtPage: getAllAtPage,
        set: (tx: UnrecognizedTranslationTransaction) => {
            set(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeUnrecognizedBubbleKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            // TODO: make a queue of actions to preserve order and for store failed actions and retry them once 30 seconds or smth
            api.submitUnrecognizedBubbleUpdate({ transactions: [tx] })
                .then(...toHandleUpdateResponse(localKey));
        },
    };
};

const prepareNotesMapping = (transactions: NoteTransaction[], localTransactions: NoteTransaction[], api: Api) => {
    addLocalBackupTransactions(transactions, getLocalBackupTransactions().NOTE_TRANSLATION);
    const { matrix, set, get } = collectNotesStorage(transactions);
    return {
        matrix: matrix,
        get: get,
        set: (tx: NoteTransaction) => {
            set(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeNoteKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            api.submitNoteUpdate({ transactions: [tx] })
                .then(...toHandleUpdateResponse(localKey));
        },
    };
};

const URL_PARAM_PAGE = "pageIndex";
const URL_PARAM_VOLUME = "volumeNumber";

const updateUrl = (qualifier: PageTransactionBase) => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    urlSearchParams.set(URL_PARAM_PAGE, qualifier.pageIndex.toString());
    urlSearchParams.set(URL_PARAM_VOLUME, qualifier.volumeNumber.toString());
    window.history.replaceState(null, "", "?" + urlSearchParams);
};

export default async (fetchingBubbles: Promise<string>) => {
    const googleTranslationsPath = API_ENDPOINT + '/unv/google_translations.json';
    const whenGoogleTranslations = fetch(googleTranslationsPath)
        .then(rs => rs.status === 200 ? rs.json() : [])
        .catch(error => []);
    const whenVolumesIndex = fetch("./../assets/volumes_index.json")
        .then(rs => rs.json());
    const fetchingNotes = fetch(API_ENDPOINT + '/assets/translator_notes_transactions.json');
    const fetchingUnrecognizedBubbles = fetch(API_ENDPOINT + '/assets/unrecognized_bubble_transactions.json');

    if (window.localStorage.getItem("APP_DEVICE_UID") === "09554110265711209") {
        const REIBAI_API_TOKEN = window.localStorage.getItem("REIBAI_API_TOKEN");
        window.localStorage.clear();
        window.localStorage.setItem("REIBAI_API_TOKEN", REIBAI_API_TOKEN);
    }

    const urlSearchParams = new URLSearchParams(window.location.search);
    let api_token: string;
    try {
        api_token = await getApiToken(urlSearchParams);
    } catch (error: unknown) {
        document.body.setAttribute('data-status', 'ERROR');
        gui.status_message_holder.textContent =
            error instanceof Error ? error.message : String(error);
        return;
    }
    const api = Api({api_token: api_token});

    const localBackup = getLocalBackupTransactions();
    const whenBubbleMapping = fetchingBubbles
        .then(text => JSON.parse(text + 'null]').slice(0, -1))
        .then(txs => prepareBubbleMapping(txs, localBackup.BUBBLE_TRANSLATION, api));
    const whenUnrecognizedBubbleMapping = fetchingUnrecognizedBubbles
        .then(rs => parseStreamedJson<UnrecognizedTranslationTransaction>(rs))
        .then(txs => prepareUnrecognizedBubbleMapping(txs, localBackup.UNRECOGNIZED_BUBBLE_TRANSLATION, api));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => prepareNotesMapping(txs, localBackup.NOTE_TRANSLATION, api));

    const googleTranslations: GoogleSentenceTranslation[] = await whenGoogleTranslations;
    const jpnToEng = new Map(
        googleTranslations.map(r => [r.jpn_ocr, r.eng_google])
    );
    const volumesIndex = await whenVolumesIndex;

    const loadingPagesQueue = ActionsQueue();

    const showSelectedPage = () => {
        gui.annotations_svg_root.innerHTML = '';
        const pageIndex = +gui.page_input.value;
        const volumeNumber = +gui.volume_input.value;

        const qualifier = { volumeNumber, pageIndex };
        updateUrl(qualifier);
        const pageName = getPageName(qualifier);

        const jsonPath = 'https://klesun-misc.github.io/reibai-sensei-translation-ocr-output/ocred_volumes/' + pageName + '.jpg.json';

        gui.status_message_holder.textContent = "Loading " + pageName + "...";
        loadingPagesQueue.enqueue(async () => {
            const jsonData = await fetch(jsonPath).then(rs => rs.json());
            const { blocks } = OcrDataAdapter(jsonData);
            const bubbles = await whenBubbleMapping;
            const unrecognizedBubbles = await whenUnrecognizedBubbleMapping;
            const notes = await whenNoteMapping;
            const translationsStorage = { bubbles, unrecognizedBubbles, notes };
            CreatePageTranslationView({qualifier, blocks, gui, translationsStorage, jpnToEng});
            gui.status_message_holder.textContent = "Ready for input";
            CompileImage({qualifier, translations: {
                bubbleMatrix: bubbles.matrix,
                unrecognizedBubbleMatrix: unrecognizedBubbles.matrix,
                noteMatrix: notes.matrix,
            }, gui: {
                ...gui,
                src_scan_image: gui.current_page_img,
            }, pageId: volumesIndex[volumeNumber - 1]?.pageIds[pageIndex]});
        }).catch(error => {
            gui.status_message_holder.textContent = "Failed to load " + pageName + " - " + error;
        });
    };

    const pageFromUrl = urlSearchParams.get(URL_PARAM_PAGE);
    const volumeFromUrl = urlSearchParams.get(URL_PARAM_VOLUME);
    if (pageFromUrl && volumeFromUrl) {
        gui.page_input.value = pageFromUrl;
        gui.volume_input.value = volumeFromUrl;
    }
    await showSelectedPage();
    gui.page_select_form.onchange = showSelectedPage;
    gui.go_to_next_page_button.onclick = () => {
        gui.page_input.value = String(+gui.page_input.value + 1);
        showSelectedPage();
    };

    whenBubbleMapping.then(...initialStateResponseHandlers);
    Promise.all([whenBubbleMapping, whenUnrecognizedBubbleMapping, whenNoteMapping])
        .then(([bubbles, unrecognizedBubbles, notes]) => {
            const displayProfit = () => printMoney(gui, bubbles.matrix, unrecognizedBubbles.matrix, notes.matrix);
            displayProfit();
            setInterval(displayProfit, 15000);
        });

    api.submitLocalBackup(localBackup);
};
