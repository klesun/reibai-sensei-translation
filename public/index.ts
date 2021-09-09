
import {Svg, Dom} from "./modules/Dom.js";
import {collectBlockText, getFontSize} from "./modules/OcrDataAdapter.js";
import OcrDataAdapter from "./modules/OcrDataAdapter.js";
import {CloudVisionApiResponse, IndexedBlock, Vertex} from "./typing/CloudVisionApi.d";

const gui = {
    annotations_svg_root: document.getElementById('annotations_svg_root')!,
    node_json_holder: document.getElementById('node_json_holder')!,
    selected_block_text_holder: document.getElementById('selected_block_text_holder')!,
    all_text_holder: document.getElementById('all_text_holder')!,
    current_page_img: document.getElementById('current_page_img')!,
    page_input: document.getElementById('page_input') as HTMLInputElement,
    volume_input: document.getElementById('volume_input') as HTMLInputElement,
    page_select_form: document.getElementById('page_select_form')!,
};

type GoogleSentenceTranslation = {
    jpn_ocr: string,
    eng_google: string,
};

export default async () => {
    const googleTranslationsPath = './unv/google_translations.json';
    const whenGoogleTranslations = fetch(googleTranslationsPath).then(rs => rs.json());

    const googleTranslations: GoogleSentenceTranslation[] = await whenGoogleTranslations;
    const jpnToEng = new Map(
        googleTranslations.map(r => [r.jpn_ocr, r.eng_google])
    );

    const showSelectedPage = async () => {
        gui.annotations_svg_root.innerHTML = '';
        const page = ('000' + gui.page_input.value).slice(-3);
        const volume = ('00' + gui.volume_input.value).slice(-2);

        gui.current_page_img.setAttribute('src', "./unv/volumes/v" + volume + "/" + page + ".jpg");

        const jsonPath = './assets/ocred_volumes/v' + volume + '/' + page + '.jpg.json';
        const whenOcrData = fetch(jsonPath).then(rs => rs.json());

        const jsonData: CloudVisionApiResponse = await whenOcrData;
        const { blocks } = OcrDataAdapter(jsonData);

        const makeBlockStr = (b: IndexedBlock) => {
            const jpnSentence = collectBlockText(b).trimEnd();
            const engSentence = jpnToEng.get(jpnSentence);
            return jpnSentence + '\n' + engSentence;
        };

        for (const block of blocks) {
            for (const paragraph of block.paragraphs) {
                for (const word of paragraph.words) {
                    for (const symbol of word.symbols) {
                        const vertices: Vertex[] = symbol.boundingBox.vertices;
                        const pointsStr = vertices.map(v => v.x + ',' + v.y).join(' ');
                        const polygon = Svg('polygon', {
                            points: pointsStr,
                            class: 'block-polygon',
                            'data-block-ocr-index': block.ocrIndex,
                        }, [
                            Svg('title', {}, JSON.stringify(symbol) + '\n' + makeBlockStr(block)),
                        ]);
                        // polygon.onclick = () => {
                        //     node_json_holder.value = window.Tls.jsExport(paragraph, '', 32);
                        //     selected_block_text_holder.textContent = collectBlockText(paragraph);
                        // };
                        gui.annotations_svg_root.appendChild(polygon);
                    }
                }
            }
        }

        gui.all_text_holder.innerHTML = '';
        for (const block of blocks) {
            const jpnSentence = collectBlockText(block).trimEnd();
            const engSentence = jpnToEng.get(jpnSentence);

            const textarea = Dom('textarea', {type: 'text', placeholder: engSentence || '', rows: 2});
            gui.all_text_holder.appendChild(
                Dom('div', {
                    class: 'sentence-block',
                    onmousedown: () => {
                        [...document.querySelectorAll('.focused-block-polygon')]
                            .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
                        [...document.querySelectorAll('[data-block-ocr-index="' + block.ocrIndex + '"]')]
                            .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
                    },
                }, [
                    Dom('div', {class: 'ocred-text-block'}, [
                        Dom('div', {}, jpnSentence),
                        Dom('div', {style: 'display: flex; align-items: end'}, [
                            Dom('div', {class: 'font-size-holder'}, getFontSize(block) + 'px'),
                            Dom('div', {class: 'confidence-holder', title: 'Recognized Text Confidence'}, block.confidence.toFixed(2)),
                        ]),
                    ]),
                    textarea,
                ])
            );
        }
    };

    await showSelectedPage();
    gui.page_select_form.onchange = showSelectedPage;
};
