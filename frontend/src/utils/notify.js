/**
 * notify — single-toast wrapper around react-hot-toast.
 * Uses a fixed ID so each new message replaces the previous one,
 * ensuring only 1 notification is ever visible at a time.
 */
import toast from 'react-hot-toast';

const ID = 'app-notify';

const notify = {
  success: (msg, opts) => toast.success(msg, { id: ID, ...opts }),
  error:   (msg, opts) => toast.error  (msg, { id: ID, ...opts }),
};

export default notify;
