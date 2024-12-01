export default class BibItem {
    key: string;
    index: number;
    id: string;
    // reference: HTMLDivElement;

    constructor(key: string, index: number=-1) {
        this.key = key;
        this.index = index;
        this.id = ['bibItem', key].join('-');
    }
}

export class BibWebsite extends BibItem {
    institution: string;
    title: string;
    website: string;
    url: string;
    read: string;

    constructor({key, index=-1, institution, title, website, url, read}) {
        super(key, index);

        this.institution = institution;
        this.title = title;
        this.website = website;
        this.url = url;
        this.read = read;
    }
}