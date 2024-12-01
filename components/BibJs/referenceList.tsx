// https://tex.stackexchange.com/questions/25701/bibtex-vs-biber-and-biblatex-vs-natbib

// https://kildekompasset.no/referansestiler/ieee/
// https://kildekompasset.no/referansestiler/apa-7th/

// Chronological reference number can be implemented by setting an index number when first used.

import Link from 'next/link';

export default class Bibliography {
    referenceDict: any;
    referenceDictSorted: any;
    referencesSorted: any;
    index: number;
    indexing: string; // none, chronological, incremental
    sorted: boolean;
    clickable: boolean;

    constructor(referenceList, indexing: string = 'chronological', showUnIndexed: boolean = true, sorted: boolean = true, clickable: boolean = true) {
        this.index = 1;
        this.indexing = indexing;
        this.sorted = sorted;
        this.clickable = clickable;

        this.referenceDict = {};
        this.referenceDictSorted = {};
        
        for (const index in referenceList) {
            let bibItem = referenceList[index];
            this.referenceDict[bibItem.key] = bibItem;
        }

        if (this.indexing == 'incremental') {
            let index: number = 1;
            for (const bibItemKey in this.referenceDict) {
                let bibItem = this.referenceDict[bibItemKey]
                bibItem.index = index;
                index++;
            }
        }
    }


    cite(bibItemKey: string) {
        let bibItem = this.referenceDict[bibItemKey];
        let index = '?'
        let id = '';

        if (this.indexing == 'chronological' && bibItem !== undefined && bibItem.index <= 0) {
            bibItem.index = this.index;
            index = bibItem.index
            id = bibItem.id;
            this.index++;

            this.referenceDictSorted[bibItem.key] = bibItem;
        }

        if (this.clickable) {
            return (
                <a href={'#' + id} style={{color: '#fff', textDecoration: 'none'}}>
                    [{index}]
                </a>
            )
        }
        else {
            return (
                <>
                    [{index}]
                </>
            )
        }

    }

    render (style: string = 'ieee') {
        let referenceDict = this.referenceDict;

        if (this.sorted) {
            referenceDict = this.referenceDictSorted;
        }

        let styledReferenceList = referenceListStyleIEEE(referenceDict);

        return (
            <>
                <h3>References</h3>
                <table>
                    <tbody>
                        {styledReferenceList}
                    </tbody>
                </table>
            </>
        );
    }
}

function referenceListStyleIEEE(referenceDict) {
    let referenceList = [];

    for (const refKey in referenceDict) {
        let bibItem = referenceDict[refKey]

        let keyData0 = [bibItem.id, 'td0'].join('-');
        let keyData1 = [bibItem.id, 'td1'].join('-');

        let index = '[' + bibItem.index + ']'; // Doing this to keep the HTML cleaner. Would do it with the data as well, but... .

        referenceList.push(
            <tr key={bibItem.id} id={bibItem.id}>
                <td key={keyData0} style={{verticalAlign: 'text-top', textAlign: 'right'}}>
                    {index}
                </td>
                <td key={keyData1} style={{verticalAlign: 'text-top', textAlign: 'left'}}>
                    {bibItem.institution}. <q>{bibItem.title}.</q> {bibItem.website}. <Link style={{color: '#fff', textDecoration: 'none'}} target="_blank" href={bibItem.url}>{bibItem.url}</Link> (accessed {bibItem.read})
                </td>
            </tr>
        )
    }

    return referenceList;
}