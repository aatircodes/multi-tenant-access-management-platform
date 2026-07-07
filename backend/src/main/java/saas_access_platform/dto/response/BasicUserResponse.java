package saas_access_platform.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class BasicUserResponse {
    private Long id;
    private String email;
}