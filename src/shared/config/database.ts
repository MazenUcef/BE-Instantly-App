import mongoose from "mongoose";


const connectDB = async (): Promise<void> => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI as string)
        // console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`MongoDB Connected`);
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
}

export default connectDB;