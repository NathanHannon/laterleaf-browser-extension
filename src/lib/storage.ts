export interface StorageData {
    token?: string;
}

export const storage = {
    get: async (keys: string | string[] | null): Promise<any> => {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result: { [key: string]: any }) => {
                resolve(result);
            });
        });
    },
    set: async (items: { [key: string]: any }): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.set(items, () => {
                resolve();
            });
        });
    },
    remove: async (keys: string | string[]): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    },
};
