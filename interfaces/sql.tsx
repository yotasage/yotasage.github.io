export interface IsqlNullString {
    String: string;
    Valid: boolean;
}

export interface IUserInfo {
    displayName: string;
    username: string;
    firstName: IsqlNullString;
    MiddleName: IsqlNullString;
    LastName: IsqlNullString;
    Email: string;
    Mobile: IsqlNullString;
    CountryCode: IsqlNullString;
    Country: IsqlNullString;
    City: IsqlNullString;
    LastOnline: number[];
    Birthdate: number[];
    Gender: IsqlNullString;
    TimeCreated: number[];
}