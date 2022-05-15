
/**
 * ensures that no more than one of the enqueued
 * actions will be running at same time
 *
 * useful in reactive workflow to ensure data consistency from parallel writes
 */
const ActionsQueue = () => {
    let lastPromise: Promise<unknown> = Promise.resolve();

    const enqueue = <T>(action: () => T) => {
        const promise = lastPromise
            .catch(() => {}).then(action);
        lastPromise = promise;
        return promise;
    };

    return {
        enqueue: enqueue,
    };
};

export default ActionsQueue;
