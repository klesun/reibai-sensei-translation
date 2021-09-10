
import {Svg, Dom} from "./modules/Dom.js";
import {collectBlockText, getBlockBounds, getFontSize} from "./modules/OcrDataAdapter.js";
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
    bubbles_translations_input_form: document.getElementById('bubbles_translations_input_form') as HTMLFormElement,
    go_to_next_page_button: document.getElementById('go_to_next_page_button')!,
    status_message_holder: document.getElementById('status_message_holder')!,
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

    let lastFormListener: ((e: Event) => void) | null = null;
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
            const bounds = getBlockBounds(block);
            const pointsStr = [
                {x: bounds.minX, y: bounds.minY},
                {x: bounds.maxX, y: bounds.minY},
                {x: bounds.maxX, y: bounds.maxY},
                {x: bounds.minX, y: bounds.maxY},
            ].map(v => v.x + ',' + v.y).join(' ');
            const polygon = Svg('polygon', {
                points: pointsStr,
                class: 'block-polygon',
                'data-block-ocr-index': block.ocrIndex,
                onmousedown: () => {
                    [...document.querySelectorAll('.focused-block-polygon')]
                        .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
                    polygon.classList.toggle('focused-block-polygon', true);
                },
                onclick: () => {
                    [...document.querySelectorAll('textarea[data-block-ocr-index="' + block.ocrIndex + '"]')]
                        .forEach(area => (area as HTMLElement).focus());
                },
            }, [
                Svg('title', {}, makeBlockStr(block)),
            ]);
            gui.annotations_svg_root.appendChild(polygon);
        }

        const focusBubbleSvg = (ocrIndex: number | string) => {
            [...document.querySelectorAll('.focused-block-polygon')]
                .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
            [...document.querySelectorAll('polygon[data-block-ocr-index="' + ocrIndex + '"]')]
                .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
        };

        // TODO: update active bubble svg when you navigate through inputs with tab
        gui.all_text_holder.innerHTML = '';
        for (const block of blocks) {
            const jpnSentence = collectBlockText(block).trimEnd();
            const engSentence = jpnToEng.get(jpnSentence);

            const textarea = Dom('textarea', {
                type: 'text',
                placeholder: engSentence || '', rows: 2,
                'data-block-ocr-index': block.ocrIndex,
            });
            gui.all_text_holder.appendChild(
                Dom('div', {
                    class: 'sentence-block',
                    onmousedown: () => focusBubbleSvg(block.ocrIndex),
                }, [
                    Dom('div', {class: 'ocred-text-block'}, [
                        Dom('div', {}, jpnSentence),
                        Dom('div', {style: 'display: flex; align-items: end'}, [
                            Dom('div', {}, [
                                Dom('div', {class: 'font-size-holder'}, getFontSize(block) + 'px'),
                                Dom('div', {class: 'confidence-holder', title: 'Recognized Text Confidence'}, block.confidence.toFixed(2)),
                            ]),
                            Dom('div', {class: 'bubble-number-holder'}, '#' + block.ocrIndex),
                        ]),
                    ]),
                    textarea,
                ])
            );
        }

        if (lastFormListener) {
            gui.bubbles_translations_input_form.removeEventListener('focus', lastFormListener);
        }
        lastFormListener = (evt: Event) => {
            const target = evt.target as HTMLElement;
            if (target.hasAttribute('data-block-ocr-index')) {
                focusBubbleSvg(target.getAttribute('data-block-ocr-index')!);
            }
        };
        gui.bubbles_translations_input_form.addEventListener('focus', lastFormListener, true);

        const firstInput = gui.all_text_holder.querySelector('textarea[data-block-ocr-index]') as HTMLTextAreaElement;
        if (firstInput) {
            firstInput.focus();
        }

        gui.status_message_holder.textContent = '';
    };

    await showSelectedPage();
    gui.page_select_form.onchange = showSelectedPage;
    gui.go_to_next_page_button.onclick = () => {
        gui.page_input.value = String(+gui.page_input.value + 1);
        showSelectedPage();
    };
};
