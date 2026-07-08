interface User {
    email: String,
    userId: number,
    googleId?: string,
    startTrial(): string
}


const hitech: User = {
    email: "mimi.somto1@gmail.com",
    userId: 123,
    googleId: "somto",
    startTrial: () => {
        return "trial started"

    }
}