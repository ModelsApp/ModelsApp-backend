class ErrorResponse extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }

  static NotFound(message = 'Not found') {
    return new this(404, message);
  }

  static BadRequest(message = 'Bad Request') {
    return new this(400, message);
  }

  static Internal(message = 'Internal server error') {
    return new this(500, message);
  }

  static Unauthorized(message = 'Unauthorized') {
    return new this(403, message);
  }
}

module.exports = ErrorResponse;
